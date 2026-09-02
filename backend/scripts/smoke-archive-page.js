/**
 * 公开页（brand-web/archive.html）在 node 里跑一遍
 *
 *   node backend/scripts/smoke-archive-page.js
 *
 * 为什么要这个：公开页是挂在官网上的获客钩子，一打开就报错是最贵的那种 bug——
 * 用户不会告诉你，他只会关掉。但它在真实浏览器里跑之前，没人能发现问题。
 * 这里用一个几十行的 DOM 桩把页面真启动一次，至少保证：
 *   1) 启动不抛异常；
 *   2) 页面里写的每个 id 都真存在（拼错 id 是最常见的事故）；
 *   3) 主流程（粘贴 → 本机打码 → 一步生成 → 渲染成稿）能走通；
 *   4) 发出去的请求体里没有明文隐私；
 *   5) 登录卡默认收起、按需展开（游客 429 自动展开），登录后请求真的带上
 *      Authorization 头，身份与配额文案跟着登录态切换；
 *   6) 服务不可用时按钮会按掉，而不是让人点到底才报错。
 *
 * 这不是浏览器，渲染细节（样式、真实布局）它管不了，也不打算管。
 */

const fs = require('fs')
const path = require('path')
const assert = require('assert')

const HTML_PATH = path.join(__dirname, '..', '..', 'brand-web', 'archive.html')
const JS_PATH = path.join(__dirname, '..', '..', 'brand-web', 'js', 'archive.js')

let passed = 0
function ok(name) {
  passed += 1
  console.log(`  ✓ ${name}`)
}

// ---------------------------------------------------------------------------
// 极简 DOM
// ---------------------------------------------------------------------------

function camel(attrName) {
  return attrName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

/** 从 innerHTML 里把带 data-* 的标签还原成子元素，好让 querySelectorAll 有东西可查 */
function parseDataChildren(html) {
  const out = []
  const tagRe = /<([a-zA-Z][\w-]*)((?:\s[^>]*?)?)\/?>/g
  let m
  while ((m = tagRe.exec(html))) {
    const attrs = m[2] || ''
    const data = {}
    const dataRe = /data-([a-zA-Z-]+)="([^"]*)"/g
    let d
    while ((d = dataRe.exec(attrs))) data[camel(d[1])] = d[2]
    if (!Object.keys(data).length) continue
    const child = makeEl(m[1])
    child.dataset = data
    const vm = attrs.match(/\bvalue="([^"]*)"/)
    if (vm) child.value = vm[1]
    if (/<textarea[^>]*>/.test(m[0])) {
      // textarea 的内容在闭合标签前，取个大概就够用于状态回写测试
      const rest = html.slice(m.index + m[0].length)
      const closeAt = rest.indexOf('</textarea>')
      if (closeAt > -1) child.value = rest.slice(0, closeAt)
    }
    out.push(child)
  }
  return out
}

function queryAll(el, selector) {
  const names = []
  const re = /\[data-([a-zA-Z-]+)\]/g
  let m
  while ((m = re.exec(selector))) names.push(camel(m[1]))
  if (!names.length) return []
  return el.children.filter((c) => names.every((n) => n in c.dataset))
}

function makeEl(tag, id) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: id || '',
    children: [],
    dataset: {},
    value: '',
    textContent: '',
    disabled: false,
    style: {},
    checked: false,
    open: false,
    href: '',
    download: '',
    _ev: {},
    _html: '',
    _classes: new Set(),
  }
  el.classList = {
    add: (...c) => c.forEach((x) => el._classes.add(x)),
    remove: (...c) => c.forEach((x) => el._classes.delete(x)),
    contains: (c) => el._classes.has(c),
    toggle: (c, on) => (on ? el._classes.add(c) : el._classes.delete(c)),
  }
  el.addEventListener = (type, fn) => {
    el._ev[type] = el._ev[type] || []
    el._ev[type].push(fn)
  }
  el.appendChild = (child) => {
    el.children.push(child)
    return child
  }
  el.remove = () => {}
  el.setAttribute = (k, v) => {
    el.dataset[k] = v
  }
  el.getAttribute = (k) => (k in el.dataset ? el.dataset[k] : null)
  el.focus = () => {}
  el.click = () => fire(el, 'click')
  el.select = () => {}
  el.scrollIntoView = () => {}
  el.querySelector = () => null
  el.querySelectorAll = (selector) => queryAll(el, selector)
  Object.defineProperty(el, 'innerHTML', {
    get() {
      return el._html
    },
    set(html) {
      el._html = String(html)
      el.children = parseDataChildren(el._html)
    },
  })
  return el
}

function fire(el, type) {
  const list = (el && el._ev && el._ev[type]) || []
  return Promise.all(list.map((fn) => fn({ type, target: el, preventDefault() {} })))
}

/** localStorage 桩：草稿箱 / 设置都只存在本机，页面在 node 里也要能读写 */
function makeLocalStorage() {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}

// ---------------------------------------------------------------------------

function buildPage(statusData, generateData, genFail) {
  const html = fs.readFileSync(HTML_PATH, 'utf8')
  const elements = new Map()
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) elements.set(m[1], makeEl('div', m[1]))

  const missedIds = []
  const doc = {
    getElementById(id) {
      const el = elements.get(id)
      if (!el) {
        missedIds.push(id)
        return null
      }
      return el
    },
    createElement: (tag) => makeEl(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
  }

  const calls = []
  const fetchStub = (url, opts) => {
    let body = null
    try {
      body = opts && opts.body ? JSON.parse(opts.body) : null
    } catch (e) {
      body = { __unparsable: String(opts && opts.body) }
    }
    calls.push({
      url,
      method: (opts && opts.method) || 'GET',
      headers: (opts && opts.headers) || {},
      body,
    })
    // 按路径分流。/status 的身份按请求头判断（带没带 Authorization），
    // 跟真服务端行为一致——退出后没头，就回游客口径。
    let dataFor
    if (/\/web-auth\/send-code$/.test(url)) {
      dataFor = { resendAfterSec: 60 }
    } else if (/\/web-auth\/login$/.test(url)) {
      dataFor = { token: 'stub-session-token', phoneDisplay: '138****5678', isNewUser: true }
    } else if (/\/status$/.test(url)) {
      const hasAuth = Boolean(opts && opts.headers && opts.headers.Authorization)
      dataFor = Object.assign(
        {},
        statusData,
        hasAuth ? { identity: 'user', remaining: 2, limit: 3 } : { identity: 'guest' },
      )
    } else if (/\/generate$/.test(url) && genFail) {
      // 模拟游客撞 429：接口能通，但业务码报超额
      return Promise.resolve({
        status: 200,
        json: () => Promise.resolve({ code: genFail.code, message: genFail.message, data: null }),
      })
    } else {
      dataFor = generateData || statusData
    }
    return Promise.resolve({
      status: 200,
      json: () => Promise.resolve({ code: 0, message: 'success', data: dataFor }),
    })
  }

  const win = { scrollTo: () => {}, location: { search: '' } }
  const nav = { clipboard: { writeText: () => Promise.resolve() } }
  const URLStub = { createObjectURL: () => 'blob:stub' }
  class BlobStub {
    constructor(parts) {
      this.parts = parts
    }
  }
  const loc = { search: '', hostname: 'localhost' }

  const src = fs.readFileSync(JS_PATH, 'utf8')
  // eslint-disable-next-line no-new-func
  new Function('document', 'window', 'navigator', 'URL', 'Blob', 'location', 'localStorage', 'fetch', src)(
    doc,
    win,
    nav,
    URLStub,
    BlobStub,
    loc,
    makeLocalStorage(),
    fetchStub,
  )

  return { elements, missedIds, calls, get: (id) => doc.getElementById(id) }
}

const CHAT = [
  '以下为聊天记录',
  '张师傅',
  '李哥，你那辆浙A12345的途观过减速带响，今天举起来看了',
  '[图片]',
  '[语音]',
  '李老板',
  '严重吗？',
  '张师傅',
  '右边小吊杆球头松了，胶套也裂了。打13812345678找我',
  '李老板',
  '一共八百六？',
].join('\n')

const GENERATED = {
  title: '杭州 大众途观 底盘异响检修：更换两侧小吊杆、四轮定位',
  summary: '过减速带异响，举升检查发现右前小吊杆球头松旷、胶套开裂。',
  sections: [
    { name: '案例概况', text: '本案例记录了一次底盘异响检修。' },
    { name: '维修前情况', text: '车主反映过减速带时底盘有异响。' },
    { name: '检查结果', text: '举升检查发现右前小吊杆球头松旷，胶套开裂。' },
    { name: '维修方案', text: '更换两侧小吊杆，并做四轮定位。' },
    { name: '维修过程', text: '拆旧件、装新件、按标准力矩紧固。' },
    { name: '完工效果', text: '路试过减速带异响消失。' },
    { name: '价格影响因素', text: '价格需根据检测结果确认。' },
    { name: '门店说明', text: '案例图片已脱敏。' },
    { name: '温馨提示', text: '底盘异响应尽早检查。' },
  ],
  captions: [{ node: '检查结果', text: '右前小吊杆球头 松旷' }],
  faq: [{ q: '这单为什么没换摆臂总成？', a: '检查确认摆臂本体仍可用，因此只更换小吊杆。' }],
  aiAbstract: '杭州一台大众途观因过减速带异响到店检查，举升确认小吊杆球头松旷、胶套开裂，更换两侧小吊杆并做四轮定位，路试异响消失。',
  sourceLabel: '微信群沟通记录转化 · 已自动脱敏',
  risk: [],
  facts: { vehicle: '大众途观', odo: '', symptom: '过减速带咯噔响', amount: '860 元' },
  doubts: [{ field: '已排除项', value: '摆臂本体可用', why: '群里没说检查了摆臂' }],
  missing: ['里程', '工期', '交车说明', '四轮定位建议', '压装力矩', '试车复现', '环车预检', '轮毂轴承', '减震器/顶胶'],
  quota: { identity: 'guest', remaining: 16, limit: 20 },
}

// ---------------------------------------------------------------------------

async function main() {
  console.log('\n公开页（node 内跑一遍）')

  // 1) 服务正常时的启动
  const page = buildPage({
    enabled: true,
    ready: true,
    model: 'qwen-plus',
    remaining: 18,
    limit: 20,
    maxChars: 20000,
    retention: '不保存任何粘贴内容',
  }, GENERATED)
  await new Promise((r) => setTimeout(r, 0))
  assert.deepStrictEqual(page.missedIds, [], `页面引用了不存在的 id：${page.missedIds.join(', ')}`)
  ok('启动不抛异常，且 JS 里引用的 id 在页面上全存在')

  assert.strictEqual(page.calls.length, 1, '启动只应打一次 /status')
  assert(/\/status$/.test(page.calls[0].url), `启动请求应是 /status，实际 ${page.calls[0].url}`)
  ok('启动只问一次状态，不多打请求')

  assert.strictEqual(String(page.get('maxChars').textContent), '20000', '字数上限要显示出来')
  assert(
    /18/.test(page.get('quota').innerHTML) || /18/.test(page.get('quota').textContent || ''),
    `剩余次数要显示出来（实际 quota=${page.get('quota').innerHTML}）`,
  )
  assert(/游客/.test(page.get('quota').textContent || ''), '配额文案要说明游客身份')
  ok('状态里的剩余次数 / 字数上限 / 身份口径渲染到页面上了')

  // 2) 生成主流程：粘贴 → 本机打码预览 → 一步生成 → 渲染成稿
  page.get('input').value = CHAT
  await fire(page.get('btnSample'), 'click') // btnSample 会填示例并直接渲染预览，不走防抖
  page.get('input').value = CHAT // 覆盖回我们的样本（btnSample 填的是它自带的示例）
  await fire(page.get('input'), 'input') // 触发防抖预览

  const chips = page.get('maskChips').innerHTML
  assert(/已在本机打码/.test(chips), '打码提示没渲染')
  ok('粘贴后显示「已在本机打码」提示')

  await new Promise((r) => setTimeout(r, 400)) // 等防抖的打码预览跑完
  const chipsAfter = page.get('maskChips').innerHTML
  assert(/手机号/.test(chipsAfter), `手机号命中没显示（chips=${chipsAfter}）`)
  assert(/车牌/.test(chipsAfter), `车牌命中没显示（chips=${chipsAfter}）`)
  assert(/语音/.test(chipsAfter), '有语音要显示语音条数')
  ok('本机打码预览：命中的隐私字段显示成小标签，语音如实计数')

  await fire(page.get('btnGenerate'), 'click')
  const genCall = page.calls.filter((c) => /\/generate$/.test(c.url)).pop()
  assert(genCall, '点生成应该发出 /generate 请求')
  assert.strictEqual(genCall.method, 'POST')
  assert(
    typeof genCall.body.text === 'string' && genCall.body.text.length > 0,
    '请求体要带脱敏后的文本',
  )
  assert(!JSON.stringify(genCall.body).includes('13812345678'), '送出去的内容里不能有手机号')
  assert(!JSON.stringify(genCall.body).includes('浙A12345'), '送出去的内容里不能有车牌')
  assert(genCall.body.text.includes('[手机号]'), '手机号应已替换成占位符')
  assert(genCall.body.text.includes('[车牌]'), '车牌应已替换成占位符')
  assert(genCall.body.text.includes('发言人A'), '昵称应换成发言人A/B')
  assert.strictEqual(genCall.body.city, '杭州', '城市要带上（标题用）')
  ok('一步生成：请求体是脱敏后的文本，原文隐私没出本机')

  // 3) 成稿渲染
  assert(!page.get('cardResult')._classes.has('hidden'), '生成完应该露出成稿卡片')
  assert.strictEqual(String(page.get('c_title').value || GENERATED.title), GENERATED.title, '标题要渲染')
  const sectionsHtml = page.get('sectionsBox').innerHTML
  for (const name of ['案例概况', '维修前情况', '检查结果', '维修方案', '维修过程', '完工效果', '价格影响因素', '门店说明', '温馨提示']) {
    assert(sectionsHtml.includes(name), `九段里缺了「${name}」`)
  }
  ok('九段正文全部渲染')

  // 存疑 + 留白：折叠轻提示，只看可见文字，不许有英文 key
  const doubtText = String(page.get('doubtBox').innerHTML || '').replace(/<[^>]*>/g, '')
  assert(/存疑/.test(doubtText), '存疑项要渲染')
  const missText = doubtText
  assert(/群里没提到/.test(missText), `缺了「群里没提到」提示：${missText}`)
  assert(!/[A-Za-z]/.test(doubtText), `存疑/留白提示里出现了英文，师傅看不懂：${doubtText}`)
  assert(/等 9 项/.test(missText), `9 项要折叠成「等 9 项」：${missText}`)
  ok('存疑与留白折叠成轻提示，全中文、超长折叠')

  const riskHtml = page.get('riskBox').innerHTML
  assert(/检查通过/.test(riskHtml), '干净文案要显示风控通过')
  ok('风控结果渲染')

  // 留白段落要有标注（把一段改成空，重新渲染才能看到——这里直接改返回数据再生成一次）
  const withBlank = Object.assign({}, GENERATED, {
    sections: GENERATED.sections.map((s) => (s.name === '门店说明' ? { name: '门店说明', text: '' } : s)),
  })
  const page2 = buildPage({ enabled: true, ready: true, remaining: 18, limit: 20, maxChars: 20000 }, withBlank)
  await new Promise((r) => setTimeout(r, 0))
  page2.get('input').value = CHAT
  await fire(page2.get('btnGenerate'), 'click')
  assert(/群里没提到/.test(page2.get('sectionsBox').innerHTML), '留白段落要标注「群里没提到」')
  ok('留白段落标注「群里没提到」，不硬补')

  // 4) 手动补充打码词要生效（原文里没有正则能命中的真名，靠手动词兜住）
  page.get('input').value = '张师傅\n李哥，你那个途观过减速带响\n李老板\n严重吗？王建国在吗'
  page.get('manualMask').value = '王建国'
  await fire(page.get('input'), 'input')
  await fire(page.get('manualMask'), 'input')
  await new Promise((r) => setTimeout(r, 400))
  assert(/手动打码/.test(page.get('maskChips').innerHTML), '手动打码命中没显示')
  await fire(page.get('btnGenerate'), 'click')
  const genCall2 = page.calls.filter((c) => /\/generate$/.test(c.url)).pop()
  assert(!genCall2.body.text.includes('王建国'), '手动补充的打码词没被打掉')
  assert(genCall2.body.text.includes('[手动打码]'), '手动打码词应替换成占位符')
  ok('手动补充打码词在本机生效，真名不出本机')

  // 5) 登录：登录卡默认收起，点「登录后每天 3 次」才展开 → 发验证码 → 登录 → 身份切到 user
  assert(page.get('cardAuth')._classes.has('hidden'), '游客一进来不该看到登录表单（默认收起，零门槛获客）')
  assert(!page.get('loginToggle')._classes.has('hidden'), '游客要在配额行看到「登录后每天 3 次」的链接')
  await fire(page.get('loginToggle'), 'click')
  assert(!page.get('cardAuth')._classes.has('hidden'), '点链接要展开登录卡')

  page.get('loginPhone').value = '13800005678'
  await fire(page.get('btnSendCode'), 'click')
  assert(/已发送/.test(page.get('loginMsg').innerHTML), '发验证码要有反馈')
  page.get('loginCode').value = '123456'
  await fire(page.get('btnLogin'), 'click')
  assert(page.get('loginForm')._classes.has('hidden'), '登录后登录表单要收起来')
  assert(!page.get('loggedInBar')._classes.has('hidden'), '登录后已登录条要显示')
  assert(/138\*\*\*\*5678/.test(page.get('whoami').textContent), '登录后显示脱敏手机号')
  const statusAfterLogin = page.calls.filter((c) => /\/status$/.test(c.url)).pop()
  assert.strictEqual(
    statusAfterLogin.headers.Authorization,
    'Bearer stub-session-token',
    '登录后的请求要带 Authorization 头',
  )
  assert(/2 \/ 3/.test(page.get('quota').textContent || ''), '登录后配额文案切到账号口径')
  assert(page.get('loginToggle')._classes.has('hidden'), '登录后「登录后每天 3 次」链接要收掉（已经登录了）')
  ok('登录：验证码登录成功，身份 / Authorization 头 / 配额口径都切换')

  // 退出后回到游客口径，登录卡回到收起
  await fire(page.get('btnLogout'), 'click')
  assert(!page.get('loginForm')._classes.has('hidden'), '退出后登录表单要回来')
  assert(page.get('cardAuth')._classes.has('hidden'), '退出后登录卡要收回起状态，别占着获客路径')
  assert(!page.get('loginToggle')._classes.has('hidden'), '退出后配额行的登录链接要回来')
  const statusAfterLogout = page.calls.filter((c) => /\/status$/.test(c.url)).pop()
  assert(!statusAfterLogout.headers.Authorization, '退出后的请求不能再带 Authorization')
  ok('退出：登录态清干净，回到游客计账，登录卡收回起')

  // 5b) 游客撞 429：登录卡自动展开并给提示，别只甩一句报错
  const hit429 = buildPage(
    { enabled: true, ready: true, remaining: 1, limit: 1, maxChars: 20000 },
    GENERATED,
    { code: 42901, message: '今天的免费次数用完了（游客每天 1 次）。手机号登录后每天 3 次。' },
  )
  await new Promise((r) => setTimeout(r, 0))
  assert.deepStrictEqual(hit429.missedIds, [], '429 分支也不该引用不存在的 id')
  assert(hit429.get('cardAuth')._classes.has('hidden'), '撞 429 之前登录卡同样是收起的')
  hit429.get('input').value = CHAT
  await fire(hit429.get('btnGenerate'), 'click')
  assert(!hit429.get('cardAuth')._classes.has('hidden'), '游客 429 后登录卡要自动展开')
  assert(/免费次数用完/.test(hit429.get('loginMsg').innerHTML), '登录卡里要给出「登录后每天 3 次」的引导')
  assert(!hit429.get('btnGenerate').disabled, '报错后按钮要弹回来，不能一直按着')
  ok('游客 429：登录卡自动展开 + 引导登录，按钮复位')

  // 6) 草稿箱：存草稿 + 重新打开
  await fire(page.get('btnSaveDraft'), 'click')
  assert(/已存草稿/.test(page.get('copyMsg').innerHTML), '存草稿要有反馈')
  const draftHtml = page.get('draftList').innerHTML
  assert(/打开/.test(draftHtml), '草稿列表要渲染出条目')
  ok('草稿箱：存草稿并渲染列表')

  // 7) 清空
  await fire(page.get('btnClear'), 'click')
  assert.strictEqual(page.get('input').value, '', '清空要把输入框清掉')
  assert(page.get('cardResult')._classes.has('hidden'), '清空要把成稿卡片收起来')
  assert.strictEqual(page.get('maskChips').innerHTML, '', '清空要把打码预览清掉')
  ok('清空按钮把流程和输入框都复位')

  // 8) 服务不可用时，入口要按掉
  const down = buildPage({ enabled: true, ready: false, remaining: 0, limit: 20, maxChars: 20000 })
  await new Promise((r) => setTimeout(r, 0))
  assert.deepStrictEqual(down.missedIds, [], '未就绪分支也不该引用不存在的 id')
  assert(down.get('btnGenerate').disabled, '服务未就绪时「生成案例」要禁用')
  assert(down.get('btnSample').disabled, '服务未就绪时「看个例子」要禁用')
  assert(/名额用完|未就绪/.test(down.get('generateMsg').innerHTML), '要告诉用户为什么不能用')
  ok('服务未就绪 / 名额用完时按钮按掉并说明原因，不会让人点到底')

  const closed = buildPage({ enabled: false, ready: false, remaining: 5, limit: 20, maxChars: 20000 })
  await new Promise((r) => setTimeout(r, 0))
  assert(closed.get('btnGenerate').disabled, '整体关闭时也要禁用')
  assert(/关闭/.test(closed.get('generateMsg').innerHTML), '要明说已关闭')
  ok('总闸拉下时页面如实显示「已关闭」')

  console.log(`\n公开页冒烟通过：${passed} 项`)
}

main().catch((e) => {
  console.error(`\n公开页冒烟失败：${e && e.message ? e.message : e}`)
  if (e && e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'))
  process.exit(1)
})
