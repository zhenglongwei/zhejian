/**
 * GEO-OBS-C05 · 浏览器巡检平台注册表
 *
 * 设计原则
 * 1. 地址、访问顺序、选择器、限速全部可配置，不写死在流程里。
 * 2. 选择器是多候选数组，不是单个值。前端一改版，备选能顶上。
 * 3. 全部候选都命中不了时，返回 selector_broken，绝不返回「没有被提到」。
 *    抓不到和没提到是两回事，混在一起就会用假数据给自己背书。
 *
 * 配置优先级（高 → 低）
 *   环境变量 GEO_BROWSER_PLATFORM_FILE 指向的 JSON 文件
 *   > 环境变量（顺序 / 启停 / 浏览器路径）
 *   > 本文件默认值
 *
 * type 说明
 *   search：查询词拼进 URL，抓结果列表（如百度网页搜索）
 *   chat  ：打开页面 → 输入 → 提交 → 等流式输出结束 → 抓答案正文与引用源
 */

const path = require('path')
const fs = require('fs')

const CONFIG_FILE_ENV = 'GEO_BROWSER_PLATFORM_FILE'
const DEFAULT_CONFIG_FILE = 'config/geo-probe-platforms.json'

/** 默认平台表。order 小的先访问。 */
const DEFAULT_PLATFORMS = [
  {
    id: 'baidu_web',
    label: '百度网页搜索',
    ecosystem: 'baidu',
    type: 'search',
    url: 'https://www.baidu.com/s?wd={q}&rn=20',
    enabled: true,
    needsLogin: false,
    order: 10,
    resultSelectors: ['#content_left .result', '.result-op', '#content_left [class*="result"]'],
    titleSelectors: ['h3', '.t', '[class*="title"]'],
    snippetSelectors: [
      '.c-abstract',
      '[class*="abstract"]',
      '[class*="summary"]',
      '[class*="content"]',
    ],
    linkSelectors: ['a[href]'],
    // 百度改版后不再把真实地址放在 mu 属性上，只剩 /link?url= 跳转。
    // 但结果块底部会用 .cosc-source-text 显示来源站名（爱企查/天眼查/百度百科），
    // 拿它当来源标识比拿跳转域名准得多。mu 还留着，万一哪天改回来。
    sourceSelectors: ['.cosc-source-text', '.c-showurl', '[class*="showurl"]', 'cite'],
    urlAttributes: ['mu', 'data-landurl', 'href'],
    adIndicators: ['广告', '推广', '商业推广'],
    captchaIndicators: ['wappass', '安全验证', '请输入验证码', 'verify.baidu.com'],
    loginIndicators: [],
    timeouts: { goto: 30000, firstResult: 15000, total: 60000 },
    // 百度是三个搜索引擎里风控最凶的。实测 4 秒一次连查，第 5 家门店就弹安全验证，
    // 之后整轮 6 个查询全废。放到 15 秒，13 家门店一轮跑下来不再触发。
    // 慢一点能跑完，快一点全军覆没——这个账很好算。
    minIntervalMs: 15000,
    maxQuestionsPerSession: 30,
  },
  {
    id: 'so_web',
    label: '360 搜索',
    ecosystem: 'other',
    type: 'search',
    url: 'https://www.so.com/s?q={q}',
    enabled: true,
    needsLogin: false,
    order: 20,
    // 360 的结构是 li.res-list，而 .result 是包住全部结果的 UL。
    // 用 .result 会把 7 条结果抓成 1 条；用 .res-list li 会先命中地图卡片里的子项。
    // 这个顺序是拿真实页面一条条试出来的，别凭直觉改。
    resultSelectors: ['li.res-list', '.res-list', 'li.res-list-item'],
    titleSelectors: ['h3', '.res-title', 'a'],
    snippetSelectors: ['.res-desc', '.res-rich', '[class*="desc"]', '[class*="summary"]', 'p'],
    linkSelectors: ['a[href]'],
    sourceSelectors: ['.res-linkinfo', 'cite', '[class*="source"]', '[class*="url"]'],
    urlAttributes: ['data-url', 'data-mdurl', 'href'],
    adIndicators: ['广告', '推广', '商业推广'],
    captchaIndicators: ['请输入验证码', '安全验证'],
    loginIndicators: [],
    timeouts: { goto: 30000, firstResult: 15000, total: 60000 },
    minIntervalMs: 4000,
    maxQuestionsPerSession: 30,
  },
  {
    // 必应不用登录、反爬比百度温和，而且它是 Copilot 和不少国产 AI 联网搜索的取数来源，
    // 在必应上的呈现能间接反映 AI 会读到什么。结构性价比赛高。
    id: 'bing_web',
    label: '必应搜索',
    ecosystem: 'other',
    type: 'search',
    url: 'https://www.bing.com/search?q={q}&count=20',
    enabled: true,
    needsLogin: false,
    order: 25,
    resultSelectors: ['li.b_algo', '.b_algo'],
    titleSelectors: ['h2', 'h2 a'],
    snippetSelectors: ['.b_caption p', '.b_lineclamp2', 'p'],
    linkSelectors: ['a[href]'],
    sourceSelectors: ['cite', '.b_attribution'],
    urlAttributes: ['href'],
    adIndicators: ['广告', 'Ad', '推广'],
    captchaIndicators: ['请证明你不是机器人', 'captcha', '安全验证'],
    loginIndicators: [],
    timeouts: { goto: 30000, firstResult: 15000, total: 60000 },
    minIntervalMs: 4000,
    maxQuestionsPerSession: 30,
  },
  {
    id: 'doubao',
    label: '豆包（网页版）',
    ecosystem: 'bytedance',
    type: 'chat',
    url: 'https://www.doubao.com/chat/',
    enabled: true,
    // 探索发现：豆包对未登录用户前 4-5 个问题能给出答案（且回答里会点名具体门店，
    // 这正是可见性分能分化的关键），但随后强制弹「登录以解锁更多功能」，
    // 且新 profile 下 ProseMirror 提交链路不稳，自动化几乎不可用。
    // 因此需要登录态。手动初始化跑 `npm run geo:probe:login` 一次，
    // 浏览器打开后扫码、cookie 落盘复用，逾期再扫一次。
    needsLogin: true,
    order: 30,
    inputSelectors: [
      'div[contenteditable="true"]',
      'textarea',
      '[data-testid="chat_input"] textarea',
      '[class*="chat-input"] textarea',
    ],
    // ProseMirror 编辑器把 Enter 当成换行，必须点发送按钮。
    // 发送按钮 ID 是 #flow-end-msg-send（2025-08 验证），再带几个 class 兜底。
    submitByEnter: false,
    submitSelectors: [
      '#flow-end-msg-send',
      'button[type="submit"]',
      '[data-testid="send_button"]',
      '[class*="send-btn"]',
      '[class*="send"]',
    ],
    answerSelectors: [
      '[data-testid="message_text"]',
      '[class*="markdown-body"]',
      '[class*="message-content"]',
      '[class*="chat-content"]',
    ],
    sourceSelectors: [
      '[class*="source"] a[href]',
      '[class*="reference"] a[href]',
      '[class*="cite"] a[href]',
      'a[href^="http"]',
    ],
    loginIndicators: [
      '登录以解锁',
      '解锁更多功能',
      '登录后',
      '扫码登录',
      '立即登录',
      '手机号登录',
      '登录以继续',
    ],
    // 每题开独立新会话（测量隔离），但用点击代替整页 re-goto。
    // re-goto 等于每题关掉浏览器重开一次，反复触发风控评估——
    // 豆包的行为验证（选图拖拽）就是被一题一题 goto 勾出来的（2026-08-30 实测）。
    newChatSelectors: [
      '[data-testid="create_chat_button"]',
      'button:has-text("新对话")',
      'a:has-text("新对话")',
      '[class*="new-chat"]',
      '[class*="create-chat"]',
      '[class*="newChat"]',
    ],
    captchaIndicators: [
      '请完成安全验证', '滑动验证', '验证码', 'captcha',
      '行为验证', '拖拽到下方', '拖动滑块', '智能验证',
      // 并行跑触发的滑块验证原文（2026-08-30 实测）：
      // "请拖动下方滑块完成验证" 不含 "拖动滑块"（中间多了"下方"），
      // 也不含 "验证码"（只有"验证"），必须补短语。
      '请拖动下方滑块', '请拖动', '通过验证', '滑动到最右', '拖动到最右',
    ],
    timeouts: { goto: 45000, input: 20000, firstAnswer: 60000, settleQuietMs: 2500, total: 180000 },
    minIntervalMs: 12000,
    maxQuestionsPerSession: 8,
  },
  {
    id: 'tongyi',
    label: '通义千问（网页版）',
    ecosystem: 'alibaba',
    type: 'chat',
    // 2026-08-30：tongyi.aliyun.com/qianwen/ 已 301 到 www.qianwen.com，
    // 直接写新域名，省一次跳转（跳转也是风控观测信号）。
    url: 'https://www.qianwen.com/',
    enabled: true,
    needsLogin: true,
    order: 40,
    inputSelectors: [
      'textarea',
      'div[contenteditable="true"]',
      '[class*="chat-input"] textarea',
      '[class*="input"] textarea',
    ],
    submitByEnter: true,
    // 2026-08-30 qianwen.com DOM 实测：发送键是 <button aria-label="发送消息">，
    // tailwind 类名不含 send/submit，旧三条选择器全灭。aria-label 是语义属性，
    // 比类名耐改版，放最前。
    submitSelectors: [
      'button[aria-label="发送消息"]',
      'button[aria-label*="发送"]',
      'button[type="submit"]',
      '[class*="send"]',
      '[class*="submit"]',
    ],
    answerSelectors: [
      // 2026-08-30 qianwen.com DOM 实测：答案正文容器是 .qk-markdown
      // （qk-markdown-complete 类在流式结束时出现）。外层还有
      // .markdown-pc-special-class / .answer-common-card / [class*="message-select-wrapper-answer"]。
      // 旧的 markdown-body/answer/message-content/chat-content 全部 0 命中。
      '.qk-markdown',
      '.markdown-pc-special-class',
      '[class*="message-select-wrapper-answer"]',
      '.answer-common-card',
      '[class*="chat-answers-card"]',
      '[class*="markdown-body"]',
      '[class*="message-content"]',
    ],
    sourceSelectors: ['[class*="source"] a[href]', '[class*="ref"] a[href]', 'a[href^="http"]'],
    loginIndicators: ['登录', '扫码登录', '立即登录', '登录阿里云'],
    newChatSelectors: [
      // qianwen.com 侧栏按钮文案是「新建对话」（2026-08-30 实测）
      'button:has-text("新建对话")',
      'a:has-text("新建对话")',
      '[class*="new-chat"]',
      'button:has-text("新对话")',
      'a:has-text("新对话")',
      '[class*="newChat"]',
    ],
    captchaIndicators: [
      '请完成安全验证', '滑动验证', '验证码', '行为验证', '拖拽到下方', '拖动滑块', '智能验证',
      '请拖动下方滑块', '请拖动', '通过验证', '滑动到最右', '拖动到最右',
    ],
    timeouts: { goto: 45000, input: 20000, firstAnswer: 60000, settleQuietMs: 2500, total: 180000 },
    minIntervalMs: 12000,
    maxQuestionsPerSession: 8,
  },
  {
    id: 'yuanbao',
    label: '腾讯元宝（网页版）',
    ecosystem: 'tencent',
    type: 'chat',
    url: 'https://yuanbao.tencent.com/chat/',
    enabled: true,
    needsLogin: true,
    order: 50,
    inputSelectors: [
      'textarea',
      'div[contenteditable="true"]',
      '[class*="chat-input"] textarea',
    ],
    submitByEnter: true,
    submitSelectors: ['button[type="submit"]', '[class*="send"]'],
    answerSelectors: [
      // 2026-08-30 DOM 探查实测：答案正文容器是 .hyc-common-markdown
      // （包在 .hyc-content-md / .agent-chat__speech-card__text 里）。
      // 旧的 markdown-body/msg-content/message-content 全部 0 命中。
      '.hyc-common-markdown',
      '[class*="hyc-content-md"]',
      '[class*="speech-card__text"]',
      '[class*="markdown-body"]',
      '[class*="msg-content"]',
      '[class*="message-content"]',
    ],
    sourceSelectors: ['[class*="source"] a[href]', '[class*="ref"] a[href]', 'a[href^="http"]'],
    loginIndicators: ['登录', '扫码登录', '立即登录', '微信登录'],
    newChatSelectors: [
      // 实测命中：.yb-new-chat-entry__item（2026-08-30）
      '.yb-new-chat-entry__item',
      'button:has-text("新对话")',
      'a:has-text("新对话")',
      '[class*="new-chat"]',
      '[class*="newChat"]',
    ],
    captchaIndicators: [
      '请完成安全验证', '滑动验证', '验证码', '行为验证', '拖拽到下方', '拖动滑块', '智能验证',
      '请拖动下方滑块', '请拖动', '通过验证', '滑动到最右', '拖动到最右',
    ],
    timeouts: { goto: 45000, input: 20000, firstAnswer: 60000, settleQuietMs: 2500, total: 180000 },
    minIntervalMs: 12000,
    maxQuestionsPerSession: 8,
  },
  {
    id: 'kimi',
    label: 'Kimi（网页版）',
    ecosystem: 'other',
    type: 'chat',
    url: 'https://www.kimi.com/',
    enabled: false,
    needsLogin: true,
    order: 60,
    inputSelectors: ['textarea', 'div[contenteditable="true"]', '[class*="chat-input"] textarea'],
    submitByEnter: true,
    submitSelectors: ['button[type="submit"]', '[class*="send"]'],
    answerSelectors: ['[class*="markdown-body"]', '[class*="message-content"]'],
    sourceSelectors: ['[class*="source"] a[href]', '[class*="ref"] a[href]', 'a[href^="http"]'],
    loginIndicators: ['登录', '扫码登录', '立即登录'],
    captchaIndicators: ['请完成安全验证', '滑动验证', '验证码'],
    timeouts: { goto: 45000, input: 20000, firstAnswer: 60000, settleQuietMs: 2500, total: 180000 },
    minIntervalMs: 12000,
    maxQuestionsPerSession: 8,
  },
]

function readJsonIfExists(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    // 配置文件坏了不能让整个巡检挂掉，退回默认值并在下面记录
    return null
  }
}

function resolveConfigFile() {
  const fromEnv = String(process.env[CONFIG_FILE_ENV] || '').trim()
  if (fromEnv) return fromEnv
  const backendRoot = path.resolve(__dirname, '../../..')
  return path.join(backendRoot, DEFAULT_CONFIG_FILE)
}

/**
 * 合并默认平台表与外部配置。
 * 外部配置按 id 覆盖（浅合并），未在外部出现的平台保持默认。
 */
function loadPlatformConfig() {
  const file = resolveConfigFile()
  const external = readJsonIfExists(file)
  const defaults = DEFAULT_PLATFORMS.map((item) => ({ ...item }))
  if (!external) {
    return { platforms: defaults, source: 'default', file, configError: false }
  }

  // 兼容两种写法：{ "platforms": [...] } 或直接给一个数组。
  // 只认对象写法的话，写错格式会静默失效——配置文件看起来生效了，
  // 实际一个平台都没被覆盖，排查起来很费劲。
  const externalList = Array.isArray(external?.platforms)
    ? external.platforms
    : Array.isArray(external)
      ? external
      : []
  const byId = new Map(defaults.map((item) => [item.id, item]))
  for (const patch of externalList) {
    if (!patch || !patch.id) continue
    const base = byId.get(patch.id) || { id: patch.id }
    byId.set(patch.id, { ...base, ...patch })
  }

  // 没写 order 的新平台排到最后
  const merged = [...byId.values()].map((item, index) => ({
    ...item,
    order: Number.isFinite(item.order) ? item.order : 100 + index,
  }))
  return { platforms: merged, source: 'file', file, configError: false }
}

function parseIdList(raw) {
  return String(raw || '')
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * 解析本次要跑的平台与顺序。
 * 顺序来源优先级：入参 platforms > 环境变量 GEO_BROWSER_PLATFORMS > 默认 order 升序
 */
function resolvePlatforms(requestedIds) {
  const { platforms, source, file } = loadPlatformConfig()
  let ids = parseIdList(Array.isArray(requestedIds) ? requestedIds.join(',') : requestedIds)
  if (!ids.length) ids = parseIdList(process.env.GEO_BROWSER_PLATFORMS)

  let picked
  if (ids.length) {
    const byId = new Map(platforms.map((item) => [item.id, item]))
    picked = ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((item, index) => ({ ...item, order: index + 1 }))
    const unknown = ids.filter((id) => !byId.has(id))
    if (unknown.length) {
      console.warn('[geo-browser-probe] 未知平台已忽略:', unknown.join(','))
    }
  } else {
    picked = platforms.filter((item) => item.enabled !== false)
  }

  picked.sort((a, b) => (a.order || 0) - (b.order || 0))
  return { platforms: picked, all: platforms, source, file }
}

function getPlatform(platformId) {
  const { all } = resolvePlatforms()
  return all.find((item) => item.id === platformId) || null
}

function buildSearchUrl(platform, question) {
  const q = encodeURIComponent(String(question || ''))
  return String(platform.url || '').replace('{q}', q)
}

module.exports = {
  DEFAULT_PLATFORMS,
  loadPlatformConfig,
  resolvePlatforms,
  resolveConfigFile,
  getPlatform,
  parseIdList,
  buildSearchUrl,
}
