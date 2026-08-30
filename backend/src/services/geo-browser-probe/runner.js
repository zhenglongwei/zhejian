/**
 * GEO-OBS-C08 · 浏览器巡检编排器
 *
 * 职责：按平台顺序 × 问题列表逐个提问，处理限速、重试、异常分类与落库。
 *
 * 异常分级
 *   临时性（可重试）：error / timeout —— 网络抖动、首屏慢，隔几秒再来一次可能就好了
 *   终止性（不重试，直接停该平台本轮剩余问题）：
 *     login_required —— 登录态没了，继续提问只会拿到未登录画面
 *     captcha        —— 已经触发风控，再问就等着封号
 *     selector_broken—— 前端改版了，重试一百次也是一样的结果
 *
 * 限速逻辑
 *   每个平台两条约束：单题间隔（minIntervalMs）和单场次题量（maxQuestionsPerSession）。
 *   目的是尽量不触发风控，而不是等触发了再想办法绕。
 */

const { prisma } = require('../../lib/prisma')
const { newId } = require('../../lib/ids')
const { resolvePlatforms } = require('./platforms')
const { probeQuestion, sleep } = require('./driver')
const {
  detectCaptcha,
  detectLoginWall,
  launchPersistentContext,
  profileStatus,
  waitForHumanToPass,
} = require('./session')

const RETRYABLE = new Set(['error', 'timeout'])
const TERMINAL = new Set(['login_required', 'captcha', 'selector_broken'])

/**
 * 搜索型平台额外容忍一次 selector_broken。
 *
 * 理由：必应单独连查 18 次零失败，但在真实巡检里仍有约一成的概率
 * 首屏没渲染出来就超时——这是网络抖动，不是页面改版。
 * 而 selector_broken 一旦判死，这个平台剩下的题全部被株连成「抓失败」，
 * 一次抖动就废掉三分之一的数据，代价太大。
 *
 * 对话型平台不享受这个待遇：它的 selector_broken 基本都是真的改版了，
 * 重试多少遍都一样，只会白白烧时间。
 */
function retryStatusesFor(platform) {
  if (String(platform.type) !== 'search') return RETRYABLE
  return new Set([...RETRYABLE, 'selector_broken'])
}

function numFromEnv(key, fallback) {
  const raw = Number(process.env[key])
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback
}

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value == null ? [] : value))
  } catch {
    return []
  }
}

async function ensureTarget(target) {
  const name = String(target?.name || '').trim()
  const city = String(target?.city || '').trim()
  if (!name) throw new Error('target.name 不能为空')

  const existing = await prisma.geoCheckTarget.findFirst({
    where: { name, city },
    select: { id: true },
  })
  if (existing) return existing.id

  const id = newId('gct')
  await prisma.geoCheckTarget.create({
    data: {
      id,
      name,
      city,
      industry: String(target?.industry || '').trim(),
      source: String(target?.source || 'SELF').trim().toUpperCase() === 'BATCH' ? 'BATCH' : 'SELF',
    },
  })
  return id
}

function terminalStub(platform, question, status, message) {
  return {
    platform: platform.id,
    platformLabel: platform.label,
    question,
    channel: 'BROWSER',
    status,
    errorMessage: String(message || '').slice(0, 480),
    answerText: '',
    citedUrls: [],
    ecosystems: [],
    screenshotPath: '',
    durationMs: 0,
    resultCount: 0,
  }
}

/**
 * 按平台类型选题目。
 *
 * search 型平台（百度/360/必应）问带店名的题，chat 型平台（豆包/通义/元宝）
 * 问不带店名的业务题。这是两套完全不同的测法：
 *   带名 —— 车主已经听说了这家店，去搜它，搜出来的是什么
 *   不带名 —— 车主压根没提店名，AI 会不会主动想到这家店
 * 混着问的结果是两边都测不准：搜索引擎回答通用业务问题只会返回通稿文章，
 * 大模型回答带店名的题等于把答案喂到嘴边。
 *
 * 一组缺了就退到另一组，绝不返回空——空了这轮就白跑了。
 */
function pickQuestions(platform, plain, named) {
  if (platform.type === 'search') return named.length ? named : plain
  return plain.length ? plain : named
}

/**
 * 回收孤儿批次。
 *
 * 进程被 kill、机器断电、脚本被 Ctrl-C 中断时，批次会永远停在 running。
 * 这些僵尸批次既不会出分，也会让「正在巡检」的状态页一直转圈。
 * 这里按时间兜底：running 超过阈值还没结束的，一律判死并写明原因。
 *
 * 注意：判定标准是「创建时间」，不是「最后一次心跳」——
 * 我们没有心跳机制，但一次巡检本来就不该超过 30 分钟，够用了。
 */
async function reclaimStaleRuns(maxAgeMinutes = 30) {
  const deadline = new Date(Date.now() - Math.max(1, maxAgeMinutes) * 60 * 1000)
  const result = await prisma.geoCheckRun.updateMany({
    where: { status: 'running', startedAt: { lt: deadline } },
    data: {
      status: 'failed',
      finishedAt: new Date(),
      errorCount: 0,
    },
  })
  return Number(result?.count || 0)
}

/**
 * 跑一轮浏览器巡检。
 *
 * @param {object} input
 * @param {object} input.target { id?, name, city, industry, source }
 * @param {string[]} input.questions
 * @param {string[]} [input.platformIds]
 * @param {(evt: object) => void} [input.onProgress]
 * @param {number} [input.maxRetries]
 * @param {boolean} [input.headless]
 * @param {boolean} [input.dryRun]
 */
async function runBrowserProbe(input) {
  const targetInput = input.target || {}
  const questions = (input.questions || []).map((item) => String(item || '').trim()).filter(Boolean)
  const namedQuestions = (input.namedQuestions || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  const maxRetries = Number.isFinite(input.maxRetries)
    ? input.maxRetries
    : numFromEnv('GEO_BROWSER_MAX_RETRIES', 1)
  const onProgress = typeof input.onProgress === 'function' ? input.onProgress : () => {}

  const { platforms, source: configSource, file: configFile } = resolvePlatforms(input.platformIds)
  const targetId = targetInput.id || (await ensureTarget(targetInput))

  // 每次开跑前先收一次孤儿批次。上一轮要是被中断过，这里顺手清干净。
  const reclaimed = await reclaimStaleRuns(
    Number.isFinite(input.staleRunMinutes) ? input.staleRunMinutes : numFromEnv('GEO_BROWSER_STALE_RUN_MINUTES', 30),
  ).catch(() => 0)

  // 每个平台跑几题要先算清楚：不同平台用的题组不一样，
  // 「问题数 × 平台数」这个老算法在这里是错的。
  const platformPlan = platforms.map((platform) => {
    const perSession = Math.max(Number(platform.maxQuestionsPerSession || 0), 1)
    const queued = pickQuestions(platform, questions, namedQuestions).slice(0, perSession)
    return { platform, queued }
  })
  const plannedCount = platformPlan.reduce((sum, item) => sum + item.queued.length, 0)

  const runId = newId('gcr')
  await prisma.geoCheckRun.create({
    data: {
      id: runId,
      targetId,
      channel: 'BROWSER',
      status: 'running',
      configJson: {
        platforms: platforms.map((item) => item.id),
        // 平台类型要落库。评分时靠它把「搜到了」和「被 AI 提到」分开算，
        // 不记下来的话，事后重算就没有依据了。
        platformTypes: platforms.reduce((acc, item) => {
          acc[item.id] = item.type || 'chat'
          return acc
        }, {}),
        questions,
        namedQuestions,
        configSource,
        configFile,
        maxRetries,
        headless: input.headless,
      },
      questionCount: plannedCount,
    },
  })

  const summary = {
    runId,
    targetId,
    channel: 'BROWSER',
    planned: plannedCount,
    ok: 0,
    failed: 0,
    terminatedPlatforms: [],
    reclaimedStaleRuns: reclaimed,
  }
  const items = []

  // 整轮时间预算。单题最长 120 秒，一个问题重试几次就能吃掉十分钟，
  // 没有总闸的话一次巡检能拖到小时级，而没人会在页面上等一小时。
  const runDeadline = Date.now() + numFromEnv('GEO_BROWSER_RUN_BUDGET_MS', 10 * 60 * 1000)
  const MAX_CONSECUTIVE_FAILURES = numFromEnv('GEO_BROWSER_MAX_CONSECUTIVE_FAILURES', 2)

  if (input.dryRun) {
    await prisma.geoCheckRun.update({
      where: { id: runId },
      data: { status: 'done', answerCount: 0, finishedAt: new Date() },
    })
    return {
      ...summary,
      status: 'dry_run',
      platforms: platformPlan.map((item) => ({
        id: item.platform.id,
        label: item.platform.label,
        type: item.platform.type,
        questions: item.queued,
      })),
      items: [],
      note: '演练模式，没有真的打开浏览器。',
    }
  }

  if (!plannedCount) {
    await prisma.geoCheckRun.update({
      where: { id: runId },
      data: { status: 'failed', finishedAt: new Date() },
    })
    return { ...summary, status: 'failed', items, note: '问题列表为空，没有可跑的巡检。' }
  }

  let playwright
  try {
    // 延迟加载：没装 playwright-core 时不能让整个后端起不来
    playwright = require('playwright-core')
  } catch (error) {
    await prisma.geoCheckRun.update({
      where: { id: runId },
      data: { status: 'failed', finishedAt: new Date() },
    })
    return {
      ...summary,
      status: 'failed',
      items,
      note: 'playwright-core 未安装，浏览器通道不可用。接口联网通道不受影响。',
    }
  }

  let context
  try {
    const launched = await launchPersistentContext(playwright, {
      headless: input.headless,
    })
    context = launched.context
    onProgress({ type: 'browser_ready', browserSource: launched.browserSource })
  } catch (error) {
    await prisma.geoCheckRun.update({
      where: { id: runId },
      data: { status: 'failed', finishedAt: new Date() },
    })
    return {
      ...summary,
      status: 'failed',
      items,
      note: `浏览器启动失败：${error.message}`,
    }
  }

  try {
    // 平台间并行：每个平台一个标签页同时开跑（2026-08-30 老板拍板）。
    // 单平台内部仍然一题一题来、minInterval 限速不变——每个平台看到的
    // 提问节奏和串行时一模一样，风控压力不增加；
    // 总时长从「各平台相加」变成「取最慢的一个」。
    // JS 单线程，summary.ok/items.push 这类同步自增在并发下是安全的。
    const runOnePlatform = async ({ platform, queued }) => {
      const page = await context.newPage()
      page.setDefaultTimeout(Number(platform.timeouts?.goto || 45000))

      let platformAborted = null
      let consecutiveFailures = 0

      // 先探一次登录态，避免未登录状态下白跑一轮。
      // 老板 2026-08-30 铁律：登录和验证由人处理，脚本只提示和等待——
      // 探测到墙/验证码时先叫人处理，最多 5 分钟，超时才放弃这个平台。
      try {
        await page.goto(platform.url, {
          waitUntil: 'domcontentloaded',
          timeout: Number(platform.timeouts?.goto || 45000),
        })
        await sleep(1200)
        const wall = await detectLoginWall(page, platform)
        const captcha = await detectCaptcha(page, platform)
        if (captcha) {
          if (await waitForHumanToPass(page, platform, 'captcha', captcha)) {
            // 解除后再确认一次登录态
            const w2 = await detectLoginWall(page, platform)
            const c2 = await detectCaptcha(page, platform)
            if (c2) platformAborted = { status: 'captcha', message: `解除后仍触发风控：${c2}` }
            else if (w2) platformAborted = { status: 'login_required', message: `登录态失效或未登录：${w2}。请重跑 npm run geo:probe:login` }
          } else {
            platformAborted = { status: 'captcha', message: `开局即触发风控：${captcha}（等待人处理超时）` }
          }
        } else if (wall) {
          if (await waitForHumanToPass(page, platform, 'login_required', wall)) {
            const c2 = await detectCaptcha(page, platform)
            const w2 = await detectLoginWall(page, platform)
            if (c2) platformAborted = { status: 'captcha', message: `解除登录墙后又触发风控：${c2}` }
            else if (w2) platformAborted = { status: 'login_required', message: `登录态仍失效：${w2}` }
          } else {
            platformAborted = { status: 'login_required', message: `登录态失效或未登录：${wall}（等待人处理超时）` }
          }
        }
      } catch (error) {
        platformAborted = { status: 'error', message: `打开平台失败：${error.message}` }
      }

      const perSession = Math.max(Number(platform.maxQuestionsPerSession || queued.length), 1)
      const loop = queued.slice(0, perSession)

      for (let index = 0; index < loop.length; index += 1) {
        const question = loop[index]
        let receipt

        if (platformAborted) {
          receipt = terminalStub(platform, question, platformAborted.status, platformAborted.message)
        } else if (Date.now() > runDeadline) {
          // 整轮预算用尽。剩下的题不再开浏览器，直接记 timeout。
          // 不加这道闸，一个平台卡死就能把一次巡检拖到小时级，
          // 而门店在页面上等不了那么久。
          receipt = terminalStub(platform, question, 'timeout', '本轮巡检总时长预算用尽，这题没跑')
        } else {
          if (index > 0) await sleep(Number(platform.minIntervalMs || 6000))
          receipt = await probeQuestion({
            page,
            platform,
            question,
            target: { id: targetId },
            index,
          })

          // 临时性错误才重试；终止性错误立刻停掉这个平台剩下的题
          const retryable = retryStatusesFor(platform)
          let attempt = 0
          while (retryable.has(receipt.status) && attempt < maxRetries) {
            attempt += 1
            await sleep(3000 * attempt)
            const retried = await probeQuestion({
              page,
              platform,
              question,
              target: { id: targetId },
              index,
            })
            receipt = { ...retried, errorMessage: retried.errorMessage || receipt.errorMessage }
          }

          if (TERMINAL.has(receipt.status)) {
            platformAborted = { status: receipt.status, message: receipt.errorMessage }
          } else if (receipt.status !== 'ok') {
            // 熔断：连着几题都失败，说明这个平台当下就是不通（多半是没登录或页面改版），
            // 再一题一题试下去只是把时间烧在注定失败的事上。
            consecutiveFailures += 1
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              platformAborted = {
                status: receipt.status,
                message: `连续 ${consecutiveFailures} 题失败，判定该平台当前不可用，剩余题目不再尝试：${receipt.errorMessage}`,
              }
            }
          } else {
            consecutiveFailures = 0
          }
        }

        await prisma.geoCheckAnswer.create({
          data: {
            id: newId('gca'),
            runId,
            targetId,
            channel: 'BROWSER',
            platform: receipt.platform,
            platformLabel: receipt.platformLabel,
            question: receipt.question,
            status: receipt.status,
            errorMessage: receipt.errorMessage || '',
            answerText: receipt.answerText || '',
            citedUrlsJson: safeJson(receipt.citedUrls),
            ecosystemsJson: safeJson(receipt.ecosystems),
            screenshotPath: receipt.screenshotPath || '',
          },
        })

        items.push(receipt)
        if (receipt.status === 'ok') summary.ok += 1
        else summary.failed += 1

        onProgress({
          type: 'answer',
          platform: receipt.platform,
          status: receipt.status,
          done: items.length,
          total: summary.planned,
        })
      }

      if (platformAborted) {
        summary.terminatedPlatforms.push({
          platform: platform.id,
          label: platform.label,
          status: platformAborted.status,
          message: platformAborted.message,
        })
      }

      await page.close().catch(() => {})
    }

    await Promise.all(platformPlan.map((item) => runOnePlatform(item)))
  } catch (error) {
    summary.fatalError = String(error?.message || error)
  } finally {
    if (String(process.env.GEO_BROWSER_KEEP_OPEN || '').trim() === '1') {
      // 老板要求：巡检结束不关浏览器，留在屏幕上供人工核对现场。
      // context 不 close，CLI 脚本负责保活进程（浏览器随进程死）。
      summary.keepBrowserOpen = true
    } else {
      await context.close().catch(() => {})
    }
  }

  const status = summary.fatalError
    ? 'failed'
    : summary.ok === 0
      ? 'failed'
      : summary.failed > 0
        ? 'partial'
        : 'done'

  await prisma.geoCheckRun.update({
    where: { id: runId },
    data: {
      status,
      answerCount: summary.ok,
      errorCount: summary.failed,
      finishedAt: new Date(),
    },
  })

  // 巡检一结束就评分。
  // 评分放在这里而不是调用方，是因为调用方有两个（HTTP 接口和命令行批量），
  // 放在任何一边，另一边扫出来的店都会没有分数、永远进不了榜单。
  // 评分失败不能让整次巡检白跑，回执已经落库了，分数补算即可。
  let score = null
  let scoreError = ''
  try {
    const { analyzeRun } = require('../geo-check-analyze.service')
    score = await analyzeRun(runId)
  } catch (error) {
    scoreError = String(error?.message || error)
    console.error('[geo-browser-probe] 评分失败:', scoreError)
  }

  return {
    ...summary,
    status,
    items,
    score,
    scoreError,
    platforms: platformPlan.map((item) => ({
      id: item.platform.id,
      label: item.platform.label,
      type: item.platform.type,
      planned: item.queued.length,
    })),
    profile: profileStatus(),
  }
}

module.exports = {
  runBrowserProbe,
  ensureTarget,
  reclaimStaleRuns,
  pickQuestions,
  RETRYABLE,
  TERMINAL,
}
