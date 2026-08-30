const express = require('express')
const { ok, fail } = require('../lib/response')
const { config } = require('../config')
const { runLlmPollCheck } = require('../services/geo-check-llm-poll.service')
const { clientIp, consumeDailyLimit } = require('../services/geo-check-rate-limit')
const { llmPollStatus } = require('../services/geo-check-env')
const { persistLlmPollCheck } = require('../services/geo-check-persist.service')
const { analyzeRun } = require('../services/geo-check-analyze.service')
const { browserProbeStatus, runBrowserProbe } = require('../services/geo-browser-probe')
const { resolveQuestions } = require('../services/geo-browser-probe/questions')
const { createJob, updateJob, finishJob, getJob, remapJob } = require('../services/geo-check-jobs.service')

const router = express.Router()

// 浏览器通道比接口通道贵得多（要真开浏览器、要限速防风控），次数单独收紧
const BROWSER_DAILY_LIMIT = Number(process.env.GEO_BROWSER_DAILY_LIMIT || 3)
const BROWSER_MAX_QUESTIONS = Number(process.env.GEO_BROWSER_MAX_QUESTIONS || 6)
// 每个引擎问几道行业题。6 引擎 ×（1 道企业名 + N 道行业题）就是一轮的成本
const LLM_POLL_QUESTION_COUNT = Number(process.env.GEO_CHECK_LLM_QUESTIONS || 4)

function readCompanyCityIndustry(body) {
  const companyName = String(body?.companyName || body?.name || '').trim()
  const city = String(body?.city || '').trim()
  const industry = String(body?.industry || '').trim()
  return { companyName, city, industry }
}

function validateIdentity(res, companyName, city, industry) {
  if (companyName.length < 2) {
    return fail(res, 40001, '请填写企业名称', 400)
  }
  if (companyName.length > 80 || city.length > 40 || industry.length > 40) {
    return fail(res, 40002, '名称、城市或行业过长', 400)
  }
  return null
}

/**
 * 体检通道状态。新架构只报大模型轮询通道：
 * 配了几家引擎就报几家，没配的不出现在清单里——
 * 页面上写「未配置」只会显得没准备好（2026-08-30 老板定）。
 */
router.get('/geo-check/status', (req, res) => {
  const status = llmPollStatus()
  return ok(res, {
    ready: status.ready,
    engines: status.engines,
    planned: status.planned,
    canRunPartial: status.ready,
    dailyLimit: status.dailyLimit,
  })
})

/**
 * 提交一次体检：大模型 API 轮询通道。
 *
 * 6 家引擎 ×（1 道企业名核对 + 4 道行业题），单轮最多 30 次接口调用，
 * 挂在 HTTP 请求上同步等会超时，所以跟浏览器巡检一样走异步任务：
 * 提交即返回 runId，前端轮询 /geo-check/run/:runId。
 */
router.post('/geo-check', async (req, res) => {
  const { companyName, city, industry } = readCompanyCityIndustry(req.body)
  const invalid = validateIdentity(res, companyName, city, industry)
  if (invalid) return invalid

  const env = llmPollStatus()
  if (!env.ready) {
    return fail(res, 50302, '体检通道暂未开放，请稍后再试', 503)
  }

  const quota = consumeDailyLimit(clientIp(req), config.geoCheck.dailyLimitPerIp)
  if (!quota.allowed) {
    return fail(res, 42901, '今日查询次数已用完，明天再试或换一个网络', 429, quota)
  }

  const runId = `poll_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const total = env.engines.length * (1 + LLM_POLL_QUESTION_COUNT)
  createJob(runId, { total })

  setImmediate(async () => {
    try {
      const report = await runLlmPollCheck(
        { companyName, city, industry },
        {
          questionCount: LLM_POLL_QUESTION_COUNT,
          onProgress: (evt) => {
            updateJob(runId, {
              progress: { done: evt.done, total: evt.total, current: evt.current || '' },
            })
          },
        },
      )

      // 落库：主动体检的门店进榜单。落库失败不影响报告本身。
      let ranking = null
      try {
        const persisted = await persistLlmPollCheck(
          { name: companyName, city, industry, source: 'SELF' },
          report,
        )
        report.persistRunId = persisted.runId
        ranking = {
          runId: persisted.runId,
          score: persisted.score.score,
          visibilityScore: persisted.score.visibilityScore,
          foundationScore: persisted.score.foundationScore,
          measuredScope: persisted.score.measuredScope,
          coverageRate: persisted.score.coverageRate,
          confidence: persisted.score.confidence,
          dimensions: persisted.score.dimensions,
        }
      } catch (error) {
        console.error('[geo-check] 落库失败，不影响本次返回:', error.message)
      }

      finishJob(runId, { status: 'done', result: { report, ranking } })
    } catch (error) {
      console.error('[geo-check]', error)
      finishJob(runId, { status: 'failed', error: error.message })
    }
  })

  return ok(res, {
    runId,
    status: 'running',
    quota,
    engines: env.engines,
    note: '体检在后台进行，通常需要一两分钟。用 runId 轮询进度。',
  })
})

/**
 * 把判定结果并回回执里。
 *
 * 分析是从数据库读的，回执对象是引擎内存里的另一份，两边必须合一次。
 * 不合的话前端拿到的回执永远没有「被提到 / 没被提到」——
 * 而这恰恰是门店唯一真正关心的那个字，其余都是过程数据。
 */
function mergeVerdicts(items, score) {
  const parsed = Array.isArray(score?.parsed) ? score.parsed : []
  if (!Array.isArray(items) || !parsed.length) return items
  return items.map((item, index) => {
    const verdict = parsed.find((row) => row.id && row.id === item.id) || parsed[index]
    if (!verdict) return item
    return {
      ...item,
      mentioned: verdict.mentioned,
      sentiment: verdict.sentiment,
      citedCount: verdict.citedCount,
    }
  })
}

/** 浏览器通道环境自检。前端据此决定是否露出「网页版实测」入口 */
router.get('/geo-check/browser/status', (req, res) => {
  const status = browserProbeStatus()
  return ok(res, {
    ...status,
    dailyLimit: BROWSER_DAILY_LIMIT,
    maxQuestions: BROWSER_MAX_QUESTIONS,
    note: status.ready
      ? '浏览器通道可用。网页版实测比接口联网慢，且需要登录态。'
      : `浏览器通道不可用：${status.reason}。接口联网通道不受影响。`,
  })
})

/**
 * 提交一次网页版实测。异步执行，立即返回 runId，前端轮询 /geo-check/run/:runId
 */
router.post('/geo-check/browser', async (req, res) => {
  const { companyName, city, industry } = readCompanyCityIndustry(req.body)
  const invalid = validateIdentity(res, companyName, city, industry)
  if (invalid) return invalid

  const env = browserProbeStatus()
  if (!env.ready) {
    return fail(res, 50301, `网页版实测暂不可用：${env.reason}`, 503)
  }

  const quota = consumeDailyLimit(clientIp(req), BROWSER_DAILY_LIMIT, 'browser')
  if (!quota.allowed) {
    return fail(res, 42902, '今日网页版实测次数已用完，明天再试', 429, quota)
  }

  const requestedPlatforms = Array.isArray(req.body?.platforms)
    ? req.body.platforms.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
    : []
  const questionCount = Math.min(
    Number(req.body?.questionCount) > 0 ? Number(req.body.questionCount) : BROWSER_MAX_QUESTIONS,
    BROWSER_MAX_QUESTIONS,
  )
  // 两组题一起解析：不带名的问大模型，带店名的问搜索引擎。
  // 只解析一组的话，搜索引擎会被喂「杭州底盘异响怎么办」这种通用题，
  // 结果 13 家门店拿到的回执一模一样，榜单排不出名次的根子就在这。
  const { questions, namedQuestions } = resolveQuestions({
    city,
    industry,
    name: companyName,
    count: questionCount,
    override: Array.isArray(req.body?.questions) ? req.body.questions : null,
  })

  const platformIds = requestedPlatforms.length
    ? requestedPlatforms
    : env.platforms.filter((item) => !item.needsLogin).map((item) => item.id)
  if (!platformIds.length) {
    return fail(res, 40005, '没有可用的平台', 400)
  }

  // 先建任务再起后台，避免请求已返回但任务还没登记
  const placeholderRunId = `pending_${Date.now().toString(36)}`
  const job = createJob(placeholderRunId, {
    total: questions.length * platformIds.length + namedQuestions.length * platformIds.length,
  })

  setImmediate(async () => {
    try {
      const result = await runBrowserProbe({
        target: { name: companyName, city, industry, source: 'SELF' },
        questions,
        namedQuestions,
        platformIds,
        onProgress: (evt) => {
          if (evt.type === 'answer') {
            updateJob(placeholderRunId, {
              progress: { done: evt.done, total: evt.total, current: evt.platform },
            })
          }
        },
      })

      // 引擎内部已经评过分了，这里只是兜底：万一评分那一步抛错，回执仍已落库，
      // 补算一次就能出分，不需要门店重跑一遍。
      let score = result.score || null
      if (!score) {
        try {
          score = await analyzeRun(result.runId)
        } catch (error) {
          console.error('[geo-check-browser] 补算评分失败:', error.message)
        }
      }

      // 真实 runId 在引擎内部才生成，这里把占位 key 换掉，前端轮询原 key 也能命中
      remapJob(placeholderRunId, result.runId)
      finishJob(result.runId, {
        status: result.status,
        result: { ...result, score, items: mergeVerdicts(result.items, score) },
      })
    } catch (error) {
      console.error('[geo-check-browser]', error)
      finishJob(placeholderRunId, { status: 'failed', error: error.message })
    }
  })

  return ok(res, {
    runId: placeholderRunId,
    status: 'running',
    quota,
    questions,
    platforms: platformIds,
    note: '网页版实测在后台跑，通常需要几分钟。用 runId 轮询进度。',
  })
})

/** 轮询巡检进度与结果 */
router.get('/geo-check/run/:runId', async (req, res) => {
  const runId = String(req.params.runId || '').trim()
  if (!runId) return fail(res, 40006, '缺少 runId', 400)
  try {
    const job = await getJob(runId)
    if (!job) return fail(res, 40401, '巡检不存在', 404)
    return ok(res, job)
  } catch (error) {
    console.error('[geo-check-run]', error)
    return fail(res, 50001, '查询巡检失败', 500)
  }
})

module.exports = router
