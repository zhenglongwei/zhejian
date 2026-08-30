/**
 * GEO-OBS-C07 · 单平台单问题的页面驱动
 *
 * 一条铁律：抓不到就报 selector_broken / login_required / captcha / timeout，
 * 绝不能回填成「没被提到」。
 * 原因很简单——门店看到自己 0 分，会去问 AI 求证；一旦求证对不上，
 * 榜单和公司信誉一起完蛋。宁可显示「这次没查成」，也不能给假的低分。
 */

const { detectCaptcha, detectLoginWall, saveScreenshot, waitForHumanToPass } = require('./session')
const { buildSearchUrl } = require('./platforms')

const POLL_INTERVAL_MS = 700

class ProbeAbort extends Error {
  constructor(reason, message) {
    super(message || reason)
    this.name = 'ProbeAbort'
    this.reason = reason
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cleanText(input) {
  return String(input || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** 按顺序试候选选择器，返回第一个可见且命中的 handle */
async function findFirstVisible(page, selectors, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  for (const selector of selectors || []) {
    if (!selector) continue
    // 1) 先让 Playwright 自己等 .first() 变可见——它会持续轮询，省事。
    try {
      const loc = page.locator(selector).first()
      await loc.waitFor({
        state: 'visible',
        timeout: Math.max(500, deadline - Date.now()),
      })
      return { selector, locator: loc }
    } catch {
      // .first() 始终不可见或没出现——多半 DOM 里有多个匹配而第一个被遮，
      // 接下来手动扫所有匹配直到 deadline（豆包新对话后输入框曾有这种中间态，2026-08-30）。
    }
    while (Date.now() < deadline) {
      try {
        const loc = page.locator(selector)
        const count = await loc.count()
        for (let i = 0; i < count; i += 1) {
          const item = loc.nth(i)
          if (await item.isVisible().catch(() => false)) {
            return { selector, locator: item }
          }
        }
      } catch {
        /* swallow */
      }
      await sleep(400)
    }
  }
  return null
}

async function collectTexts(page, selectors, limit = 20) {
  for (const selector of selectors || []) {
    if (!selector) continue
    try {
      const texts = await page.locator(selector).evaluateAll((nodes, max) => {
        return nodes
          .map((node) => (node.innerText || node.textContent || '').trim())
          .filter(Boolean)
          .slice(-max)
      }, limit)
      if (texts && texts.length) return { selector, texts }
    } catch {
      // 换下一个候选
    }
  }
  return { selector: '', texts: [] }
}

async function collectLinks(page, selectors, limit = 20) {
  for (const selector of selectors || []) {
    if (!selector) continue
    try {
      const links = await page.locator(selector).evaluateAll((nodes, max) => {
        return nodes
          .map((node) => ({
            href: String(node.getAttribute('href') || '').trim(),
            title: (node.innerText || node.getAttribute('title') || '').trim(),
          }))
          .filter((item) => /^https?:\/\//i.test(item.href))
          .slice(0, max)
      }, limit)
      if (links && links.length) return { selector, links }
    } catch {
      // 换下一个候选
    }
  }
  return { selector: '', links: [] }
}

/**
 * 答案兜底提取：answerSelectors 全部失配时读主内容区文本。
 * 平台改版后答案容器 class 变了，答案明明渲染在页面上，
 * 精确选择器却一个都不命中，傻等 60 秒报 timeout
 * （2026-08-30 豆包/元宝实测截图实锤）。剔除侧栏/导航/弹窗/输入区，
 * 只留对话正文。粗糙但对改版免疫——稳定性优先于精确性。
 */
async function extractBodyAnswer(page) {
  return page
    .evaluate(() => {
      const clone = document.body.cloneNode(true)
      const REMOVE = [
        'script', 'style', 'aside', 'nav', 'header', 'footer', 'form',
        '[class*="sidebar"]', '[class*="drawer"]', '[class*="modal"]',
        '[class*="popup"]', '[class*="dialog"]', '[class*="toast"]',
        '[class*="download"]', '[class*="input"]', '[class*="editor"]',
        // 元宝侧栏实测 class（2026-08-30）：yb-nav 系列 + 最近对话列表。
        // 不剔的话兜底会把历史对话标题当成答案抓回来（假成功）。
        '[class*="yb-nav"]', '[class*="recent-conv"]',
        '[contenteditable]', 'textarea', 'button',
      ]
      clone.querySelectorAll(REMOVE.join(',')).forEach((el) => el.remove())
      return (clone.innerText || '').trim()
    })
    .catch(() => '')
}

/**
 * 等流式输出稳定：连续 settleQuietMs 内文本长度不再变化，认为答完了。
 * 中途出现验证码则中断。
 */
async function waitForAnswerSettle(page, platform, options) {
  const { answerSelectors } = platform
  const timeouts = platform.timeouts || {}
  const quietMs = Number(timeouts.settleQuietMs || 2500)
  const deadline = Date.now() + Number(timeouts.total || 120000)
  const firstDeadline = Date.now() + Number(timeouts.firstAnswer || 45000)
  // 稳定但太短的文本不算答案：提交后答案还没开始流的那一两秒，
  // 页面文本也是"稳定"的（只有问题气泡和边框），不卡长度会提前返回垃圾。
  const MIN_ANSWER_LEN = 80

  let lastText = ''
  let lastChangeAt = Date.now()
  let sawAny = false

  while (Date.now() < deadline) {
    let captcha = await detectCaptcha(page, platform)
    if (captcha) {
      // 老板铁律：等人处理，不自动判死。无头模式 waitForHumanToPass 直接返回 false。
      if (await waitForHumanToPass(page, platform, 'captcha', captcha)) continue
      throw new ProbeAbort('captcha', `触发验证码/风控：${captcha}`)
    }

    // 登录墙也可能在等答案过程中才弹出来（豆包对未登录用户问几个后会强制要求登录），
    // 只在开头探一次会错过这种情况，于是白白等到 timeout。
    let wall = await detectLoginWall(page, platform)
    if (wall) {
      if (await waitForHumanToPass(page, platform, 'login_required', wall)) continue
      throw new ProbeAbort('login_required', `触发登录墙：${wall}`)
    }

    const { texts } = await collectTexts(page, answerSelectors, 3)
    let current = cleanText((texts || []).join('\n'))
    if (!current) {
      // 精确选择器失配 → body 兜底（见 extractBodyAnswer 注释）
      current = cleanText(await extractBodyAnswer(page))
    }
    if (current) {
      if (!sawAny) sawAny = true
      if (current !== lastText) {
        lastText = current
        lastChangeAt = Date.now()
      } else if (Date.now() - lastChangeAt >= quietMs && lastText.length >= MIN_ANSWER_LEN) {
        return lastText
      }
    } else if (!sawAny && Date.now() > firstDeadline) {
      throw new ProbeAbort('timeout', '等首次回答超时')
    }
    await sleep(POLL_INTERVAL_MS)
  }

  if (lastText && lastText.length >= MIN_ANSWER_LEN) return lastText
  throw new ProbeAbort('timeout', '回答未稳定，整体超时')
}

/**
 * 从一个链接节点里挑出真实目标地址。
 *
 * 百度自然结果的 h3 a 给的 href 是自家跳转链接（/link?url=...），
 * 真实地址藏在 mu 属性里。直接拿 href 的话，20 条结果的域名全是 baidu.com，
 * 「命中了哪些生态」「有没有自家站点」这两项就彻底失真了。
 * 所以属性有优先级，能拿到真地址就绝不将就跳转链接。
 */
const DEFAULT_URL_ATTRIBUTES = ['mu', 'data-landurl', 'data-url', 'data-href', 'href']

/** 搜索结果页自身的跳转域名，拿不到真地址时要认出来，不能当成引用来源 */
const REDIRECT_PATH_HOSTS = ['www.baidu.com', 'm.baidu.com', 'baidu.com', 'www.so.com', 'so.com']

const DEFAULT_AD_INDICATORS = ['广告', '推广', '商业推广', '赞助']

function domainOfUrl(url) {
  try {
    return String(new URL(url).hostname || '').replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

/**
 * search 型平台：查询词拼进 URL，按结果节点逐条抽取。
 *
 * 早先的写法是 collectLinks(page, ['a[href]'])，抓的是**整个页面**的链接——
 * 导航、页脚、相关搜索、猜你想问全算进「引用来源」。后果是引用数恒为 20 条上限、
 * 生态命中恒为 baidu+other、内容资产分永远满分。榜单上 13 家门店清一色 17 分，
 * 一半原因就在这里。现在改成按结果节点抽取，顺带把位次留下来。
 */
async function extractSearchRows(page, platform, resultSelector, maxRows = 20) {
  const cfg = {
    maxRows,
    titleSelectors: platform.titleSelectors || [],
    snippetSelectors: platform.snippetSelectors || [],
    sourceSelectors: platform.sourceSelectors || [],
    urlAttributes: platform.urlAttributes || DEFAULT_URL_ATTRIBUTES,
    adIndicators: platform.adIndicators || DEFAULT_AD_INDICATORS,
  }

  const rawRows = await page
    .locator(resultSelector)
    .evaluateAll((nodes, c) => {
      const textOf = (el) => (el ? String(el.innerText || el.textContent || '').trim() : '')

      const firstText = (root, selectors) => {
        for (const sel of selectors) {
          let el = null
          try {
            el = root.querySelector(sel)
          } catch {
            continue
          }
          const t = textOf(el)
          if (t) return t
        }
        return ''
      }

      // 推广位要剔除，但不能用「正文里出现广告二字」来判断——
      // 正文讲营销的文章会被误杀。只认那种短标签元素，文字恰好是「广告」「推广」。
      const isAd = (root, words) => {
        let marks = []
        try {
          marks = root.querySelectorAll('span,em,i,label,font')
        } catch {
          return false
        }
        for (const el of marks) {
          const t = textOf(el)
          if (t && t.length <= 6 && words.includes(t)) return true
        }
        return false
      }

      const pickUrl = (root, attrs) => {
        let anchors = []
        try {
          anchors = root.querySelectorAll('a[href]')
        } catch {
          return { url: '', anchorText: '' }
        }
        for (const a of anchors) {
          for (const attr of attrs) {
            const value = String(a.getAttribute(attr) || '').trim()
            if (/^https?:\/\//i.test(value)) return { url: value, anchorText: textOf(a) }
          }
        }
        return { url: '', anchorText: '' }
      }

      const out = []
      for (const node of nodes) {
        if (out.length >= c.maxRows) break
        const blob = textOf(node)
        if (!blob) continue
        if (isAd(node, c.adIndicators)) continue

        const title = firstText(node, c.titleSelectors)
        const snippet = firstText(node, c.snippetSelectors)
        const source = firstText(node, c.sourceSelectors)
        const picked = pickUrl(node, c.urlAttributes)
        // 标题和摘要都没有、只剩一个链接的，多半是导航或相关搜索，丢掉
        if (!title && !snippet && !picked.anchorText) continue

        out.push({
          rank: out.length + 1,
          title: title || picked.anchorText || '',
          snippet,
          source,
          url: picked.url,
        })
      }
      return out
    }, cfg)

  // 跳转链接留在库里没意义，但标题摘要还能用来判断有没有提到店名，
  // 所以只把 url 清掉，行本身保留。
  // 百度改版后自然结果只剩 /link?url= 跳转，真实域名拿不到，
  // 好在页面上会用 .cosc-source-text 显示来源站名（爱企查、天眼查、百度百科…）。
  // 生态归属和来源丰富度按来源站名算，比按跳转域名算准得多。
  return rawRows.map((row) => {
    const host = domainOfUrl(row.url)
    const isRedirectOnly = !host || (REDIRECT_PATH_HOSTS.includes(host) && /\/link/i.test(row.url))
    const cleanSource = String(row.source || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim()
    return {
      ...row,
      url: isRedirectOnly ? '' : row.url,
      domain: isRedirectOnly ? '' : host,
      source: cleanSource,
    }
  })
}

/** search 型平台：查询词拼进 URL，抓结果列表 */
async function runSearchQuestion(page, platform, question) {
  const url = buildSearchUrl(platform, question)
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: Number(platform.timeouts?.goto || 30000),
  })

  const resultHandle = await findFirstVisible(
    page,
    platform.resultSelectors,
    Number(platform.timeouts?.firstResult || 15000),
  )

  const captcha = await detectCaptcha(page, platform)
  if (captcha) throw new ProbeAbort('captcha', `触发验证码：${captcha}`)

  if (!resultHandle) {
    // 也可能是这个查询真的没有任何结果，两种情况要分开
    const bodyText = await page.evaluate(() => document.body.innerText || '').catch(() => '')
    const looksEmpty = /没有找到|未找到|无结果|抱歉/.test(bodyText)
    if (looksEmpty) {
      return { answerText: '', citedUrls: [], emptyResult: true }
    }
    throw new ProbeAbort('selector_broken', '结果列表选择器全部未命中')
  }

  await sleep(600)
  const rows = await extractSearchRows(page, platform, resultHandle.selector, 20)
  if (!rows.length) {
    const bodyText = await page.evaluate(() => document.body.innerText || '').catch(() => '')
    if (/没有找到|未找到|无结果|抱歉/.test(bodyText)) {
      return { answerText: '', citedUrls: [], emptyResult: true }
    }
    throw new ProbeAbort('selector_broken', '结果节点全部被判为推广位或抓不到标题摘要')
  }

  // 答案正文按位次拼，这样后面算「第几条才提到这家店」时，
  // 字符偏移和真实位次是对得上的。
  const answerText = cleanText(
    rows.map((row) => `${row.rank}. ${row.title}\n${row.snippet}`).join('\n\n'),
  )

  return {
    answerText,
    citedUrls: rows.map((row) => ({
      url: row.url,
      title: row.title,
      snippet: row.snippet,
      source: row.source,
      rank: row.rank,
      domain: row.domain,
    })),
    emptyResult: false,
  }
}

/**
 * 聊天平台开下一个独立会话：优先点「新对话」按钮（页面不刷新），
 * 找不到按钮才降级为整页 goto 平台首页。
 * 每题都 goto 等于每题关掉浏览器重开一次，反复触发风控评估——
 * 豆包的行为验证就是这么被勾出来的（2026-08-30 实测）。
 * 注意隔离性不变：新会话 = 陌生人第一问，绝不在原对话里追问，
 * 否则后续答案被前文污染，提及率不可复算。
 */
async function openFreshConversation(page, platform, timeouts) {
  if (Array.isArray(platform.newChatSelectors) && platform.newChatSelectors.length) {
    const btn = await findFirstVisible(page, platform.newChatSelectors, 3000)
    if (btn) {
      await btn.locator.click({ timeout: 5000 }).catch(() => {})
      await sleep(1500)
      return 'click'
    }
  }
  await page.goto(platform.url, {
    waitUntil: 'domcontentloaded',
    timeout: Number(timeouts.goto || 45000),
  })
  await sleep(800)
  return 'goto'
}

/** chat 型平台：输入 → 提交 → 等答案稳定 → 抓正文与引用源 */
async function runChatQuestion(page, platform, question) {
  const loginWall = await detectLoginWall(page, platform)
  if (loginWall) throw new ProbeAbort('login_required', `未登录：${loginWall}`)

  const input = await findFirstVisible(
    page,
    platform.inputSelectors,
    Number(platform.timeouts?.input || 20000),
  )
  if (!input) {
    let captcha = await detectCaptcha(page, platform)
    if (captcha) {
      if (await waitForHumanToPass(page, platform, 'captcha', captcha)) {
        return runChatQuestion(page, platform, question) // 人解除后重试
      }
      throw new ProbeAbort('captcha', `触发验证码：${captcha}`)
    }
    const wall = await detectLoginWall(page, platform)
    if (wall) {
      if (await waitForHumanToPass(page, platform, 'login_required', wall)) {
        return runChatQuestion(page, platform, question)
      }
      throw new ProbeAbort('login_required', `未登录：${wall}`)
    }
    throw new ProbeAbort('selector_broken', '输入框选择器全部未命中')
  }

  // 模拟真人：先点一下，再逐字输入。直接 fill 太干净，容易被判定为脚本。
  // 注意：fill('') 在 ProseMirror 这类 contenteditable 上会破坏编辑器内部状态
  // （实测后会出现「输入框有字、但提交按钮点了没反应」的怪事）。
  // 改用 Ctrl+A + Delete 清空，对 textarea 和 contenteditable 都安全。
  await input.locator.click({ timeout: 8000 }).catch(() => {})
  try {
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.press('Delete')
  } catch {
    // 输入框还没拿到焦点时清空会失败，下面 type 会再 focus
  }
  await page.keyboard.type(String(question || ''), { delay: 30 })
  if (process.env.GEO_PROBE_DEBUG) console.log(`[driver] 文本已输入, 长度=${String(question||'').length}`)

  // 提交方式：先 Enter（多数聊天 UI 的默认），等 3 秒看答案有没有开始出来；
  // 没出来再点发送按钮。豆包这类 ProseMirror 编辑器把 Enter 当换行，
  // 不点按钮就永远发不出去——这点过才知道，所以两条路都留着。
  let submitted = false
  if (platform.submitByEnter !== false) {
    await page.keyboard.press('Enter')
    await sleep(3000)
    const started = await collectTexts(page, platform.answerSelectors, 3)
    submitted = Boolean(cleanText((started.texts || []).join('\n')))
  }

  if (!submitted) {
    const submit = await findFirstVisible(page, platform.submitSelectors, 5000)
    if (!submit) {
      // 提交按钮找不到有两种真实情况，必须先分辨：
      //   a) 发送键被「停止生成」按钮替换了——说明我们其实提交成功了，正在流式。
      //      Enter 路径检测在 3 秒窗内抓不到第一 token（豆包/通义常见 4-6 秒），
      //      跑到这儿时流式已开始，按钮 aria-label 从「发送消息」变成「停止生成」。
      //      此时再去找「发送消息」当然找不到。错判 selector_broken = 把成功当失败。
      //   b) 真的没发出去（输入框被禁用、卡在验证墙、选择器失效）。
      // 先按 a 再按 b 兜底。
      const STOP_SELECTORS = [
        'button[aria-label*="停止"]',
        'button[aria-label*="暂停"]',
        '[class*="stop"]',
        '[class*="cancel"]',
        '[class*="abort"]',
      ]
      const stopBtn = await findFirstVisible(page, STOP_SELECTORS, 1500).catch(() => null)
      if (stopBtn) {
        if (process.env.GEO_PROBE_DEBUG) console.log(`[driver] 提交时检测到停止按钮 (${stopBtn.selector})，已流式，继续等待`)
      } else {
        // 流式按钮也没找到——再二次确认一下答案容器是否已经出现（兜底容错）
        const late = await collectTexts(page, platform.answerSelectors, 3)
        if (cleanText((late.texts || []).join('\n'))) {
          if (process.env.GEO_PROBE_DEBUG) console.log(`[driver] 答案容器已渲染，按已提交处理`)
        } else {
          const captcha = await detectCaptcha(page, platform)
          if (captcha && (await waitForHumanToPass(page, platform, 'captcha', captcha))) {
            return runChatQuestion(page, platform, question)
          }
          throw new ProbeAbort('selector_broken', '提交按钮选择器全部未命中')
        }
      }
    } else {
      if (process.env.GEO_PROBE_DEBUG) console.log(`[driver] 命中提交选择器: ${submit.selector}`)
      await submit.locator.click({ timeout: 5000 })
    }
  }

  let answerText = await waitForAnswerSettle(page, platform, {})
  // body 兜底会把用户提问气泡也抓进答案文本。带店名的问题若留在里面，
  // 打分时会误判为「AI 主动提到了这家店」——假提及比漏提更致命。
  // 把问题原文从答案里剔掉再入库。
  if (question) answerText = answerText.split(String(question)).join('').trim()
  const { links } = await collectLinks(page, platform.sourceSelectors, 20)

  return {
    answerText,
    citedUrls: (links || []).map((item) => ({ url: item.href, title: item.title })),
  }
}

/**
 * 执行一次提问。返回统一的回执结构，失败也返回（不抛）。
 * @param {object} params
 * @param {object} params.page
 * @param {object} params.platform
 * @param {string} params.question
 * @param {object} params.target { id, name }
 * @param {number} params.index
 */
async function probeQuestion({ page, platform, question, target, index = 0 }) {
  const startedAt = Date.now()
  const base = {
    platform: platform.id,
    platformLabel: platform.label,
    question: String(question || ''),
    channel: 'BROWSER',
    status: 'ok',
    errorMessage: '',
    answerText: '',
    citedUrls: [],
    ecosystems: [],
    screenshotPath: '',
    durationMs: 0,
  }

  try {
    const timeouts = platform.timeouts || {}
    if (platform.type !== 'search') {
      // 对话型平台：第一题落地首页；后续题开新会话（优先点按钮，降级 goto）。
      if (index > 0) {
        await openFreshConversation(page, platform, timeouts)
      } else {
        await page.goto(platform.url, {
          waitUntil: 'domcontentloaded',
          timeout: Number(timeouts.goto || 45000),
        })
        await sleep(800)
      }
    }
    // 搜索型平台不能在这里抢先 goto 一次 platform.url：
    // 那时的 URL 里还是字面量 {q}，等于白打一次请求，紧跟着 runSearchQuestion
    // 又要 goto 真正的查询 URL。一次查询变两次，风控压力直接翻倍——
    // 实测百度连查到第 5 家门店就弹安全验证，就是这么来的。
    // 多出来的一次页面加载，也顺带制造了必应的偶发渲染超时。

    const captcha = platform.type === 'search' ? '' : await detectCaptcha(page, platform)
    if (captcha) {
      const passed = await waitForHumanToPass(page, platform, 'captcha', captcha)
      if (!passed) throw new ProbeAbort('captcha', `触发验证码/风控：${captcha}`)
      // 人已解除：继续往下走，让这一题在解锁后的页面里正常执行（不浪费这题）。
    }

    const result =
      platform.type === 'search'
        ? await runSearchQuestion(page, platform, question)
        : await runChatQuestion(page, platform, question)

    // 留证截图：浏览器通道的价值就在这里，每一条都能回溯
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      base.screenshotPath = await saveScreenshot(
        page,
        `${platform.id}_${target.id}_${index}_${stamp}.png`,
      )
    } catch {
      /* 截图失败不影响文字结果 */
    }

    return {
      ...base,
      answerText: result.answerText || '',
      citedUrls: result.citedUrls || [],
      ecosystems: [platform.ecosystem].filter(Boolean),
      durationMs: Date.now() - startedAt,
      // 「查了，但一个结果都没有」和「抓失败」是两回事。
      // 前者是合法的 0 命中，可以进分母；后者不行。必须带上这个标记。
      emptyResult: Boolean(result.emptyResult),
      resultCount: (result.citedUrls || []).length,
    }
  } catch (error) {
    const reason = error instanceof ProbeAbort ? error.reason : 'error'
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      base.screenshotPath = await saveScreenshot(
        page,
        `${platform.id}_${target.id}_${index}_${reason}_${stamp}.png`,
      )
    } catch {
      /* ignore */
    }
    return {
      ...base,
      status: reason,
      errorMessage: String(error?.message || error || '未知错误').slice(0, 480),
      durationMs: Date.now() - startedAt,
    }
  }
}

module.exports = {
  probeQuestion,
  extractSearchRows,
  findFirstVisible,
  collectTexts,
  collectLinks,
  waitForAnswerSettle,
  cleanText,
  sleep,
  domainOfUrl,
  DEFAULT_URL_ATTRIBUTES,
  ProbeAbort,
}
