/**
 * 公开试用页（brand-web/archive.html）在 node 里跑一遍
 *
 *   node backend/scripts/smoke-archive-page.js
 *
 * 为什么要这个：公开页是挂在官网上的获客钩子，一打开就报错是最贵的那种 bug——
 * 用户不会告诉你，他只会关掉。但它在真实浏览器里跑之前，没人能发现问题。
 * 这里用一个几十行的 DOM 桩把页面真启动一次，至少保证：
 *   1) 启动不抛异常；
 *   2) 页面里写的每个 id 都真存在（拼错 id 是最常见的事故）；
 *   3) 主流程（粘贴 → 本机解析脱敏 → 渲染）能走通；
 *   4) 服务不可用时按钮会按掉，而不是让人点到底才报错。
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

// ---------------------------------------------------------------------------

function buildPage(statusData, extractData) {
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
    calls.push({ url, method: (opts && opts.method) || 'GET', body })
    // /status 和 /extract 的返回结构不一样，桩要按路径分流，
    // 不然测不到「提取完之后界面长什么样」。
    const dataFor = /\/status$/.test(url) ? statusData : extractData || statusData
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
  new Function('document', 'window', 'navigator', 'URL', 'Blob', 'location', 'fetch', src)(
    doc,
    win,
    nav,
    URLStub,
    BlobStub,
    loc,
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

// ---------------------------------------------------------------------------

async function main() {
  console.log('\n公开试用页（node 内跑一遍）')

  // 1) 服务正常时的启动
  const page = buildPage({
    enabled: true,
    ready: true,
    model: 'qwen-plus',
    remaining: 18,
    limit: 20,
    maxChars: 20000,
    retention: '不保存任何粘贴内容',
  },
  // 后端转完中文之后的样子。故意给 9 项——17 项里大半没提到是常态，
  // 全列出来一行塞不下，页面得自己折叠。
  {
    facts: { vehicle: '大众途观', odo: '', symptom: '过减速带咯噔响', plan: '更换两侧小吊杆' },
    timeline: [],
    doubts: [{ field: '已排除项', value: '摆臂本体可用', why: '群里没说检查了摆臂' }],
    missing: ['里程', '工期', '交车说明', '四轮定位建议', '压装力矩', '试车复现', '环车预检', '轮毂轴承', '减震器/顶胶'],
  })
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
  ok('状态里的剩余次数 / 字数上限渲染到页面上了')

  // 2) 主流程：粘贴 → 本机解析 + 脱敏 → 渲染
  page.get('input').value = CHAT
  await fire(page.get('btnParse'), 'click')

  const chips = page.get('maskChips').innerHTML
  assert(/已在本机脱敏/.test(chips), '脱敏提示没渲染')
  assert(/手机号/.test(chips), `手机号命中没显示（chips=${chips}）`)
  assert(/车牌/.test(chips), `车牌命中没显示（chips=${chips}）`)
  ok('粘贴后在本机完成脱敏，命中的字段显示成小标签')

  const msgList = page.get('msgList').innerHTML
  assert(!/13812345678|浙A12345|张师傅|李老板/.test(msgList), `渲染结果里有未脱敏内容：${msgList.slice(0, 200)}`)
  assert(/发言人A/.test(msgList), '昵称应换成发言人A/B')
  ok('渲染出来的消息里没有手机号 / 车牌 / 真实昵称')

  const warn = page.get('parseMsg').innerHTML
  assert(/语音/.test(warn), '有语音必须提醒拿不到内容')
  assert(/图片/.test(warn), '有图片必须提醒只剩占位')
  ok('语音和图片的「拿不到内容」如实提醒，不假装读到了')

  assert(
    !page.get('cardStep2')._classes.has('hidden'),
    '解析完应该露出第二步',
  )
  ok('解析完自动展开第二步')

  // 3) 手改的内容要能进到发给服务端的东西里（页面上的编辑不是摆设）。
  //    注意：再点一次「解析」会重新从文本框解析，改动自然被覆盖——那是设计如此。
  //    真正要保证的是「改完点提取，送出去的是改过的」。
  const senderInput = page
    .get('msgList')
    .children.filter((c) => 'msg' in c.dataset && c.dataset.part === 'sender')[0]
  assert(senderInput, '应能找到发言人输入框')
  senderInput.value = '王技师'
  await fire(senderInput, 'input')

  await fire(page.get('btnExtract'), 'click')
  const extractCall = page.calls.filter((c) => /\/extract$/.test(c.url)).pop()
  assert(extractCall, '点提取应该发出 /extract 请求')
  assert(
    Array.isArray(extractCall.body.messages) && extractCall.body.messages.length > 0,
    '请求体要带上消息',
  )
  assert(
    extractCall.body.messages.some((m) => m.sender === '王技师'),
    `手改的发言人没进请求体：${JSON.stringify(extractCall.body.messages)}`,
  )
  assert(
    !JSON.stringify(extractCall.body).includes('13812345678'),
    '送出去的内容里不能有手机号',
  )
  assert(!JSON.stringify(extractCall.body).includes('浙A12345'), '送出去的内容里不能有车牌')
  ok('手改发言人后能回写，且送出去的仍是脱敏后的内容')

  // 「生成案例」按钮旁边那一行是师傅直接看的，英文 key 一个都不许出现。
  // 后端已经转成中文，这里守住两件事：没有英文、超长会折叠。
  const missLine = String(page.get('missingLine').textContent || '')
  assert(/群里没提到/.test(missLine), `缺了「群里没提到」提示：${missLine}`)
  assert(!/[A-Za-z]/.test(missLine), `「群里没提到」这行出现了英文，师傅看不懂：${missLine}`)
  assert(/等 9 项/.test(missLine), `9 项要折叠成「等 9 项」：${missLine}`)
  assert.strictEqual((missLine.match(/、/g) || []).length, 5, `只列前 6 项（5 个顿号）：${missLine}`)
  // 只看可见文字——标签名（div、b、class）本身就是英文字母，直接查 innerHTML 会误报
  const doubtText = String(page.get('doubtBox').innerHTML || '').replace(/<[^>]*>/g, '')
  assert(doubtText && !/[A-Za-z]/.test(doubtText), `存疑项里也不能有英文：${doubtText}`)
  ok('「群里没提到」全中文且超长折叠，不把字段 key 甩给门店')

  // 4) 清空
  await fire(page.get('btnClear'), 'click')
  assert.strictEqual(page.get('input').value, '', '清空要把输入框清掉')
  assert(page.get('cardStep2')._classes.has('hidden'), '清空要把后续步骤收起来')
  ok('清空按钮把流程和输入框都复位')

  // 5) 服务不可用时，入口要按掉
  const down = buildPage({ enabled: true, ready: false, remaining: 0, limit: 20, maxChars: 20000 })
  await new Promise((r) => setTimeout(r, 0))
  assert.deepStrictEqual(down.missedIds, [], '未就绪分支也不该引用不存在的 id')
  assert(down.get('btnParse').disabled, '服务未就绪时「解析」要禁用')
  assert(down.get('btnExtract').disabled, '服务未就绪时「提取」要禁用')
  assert(/名额用完|未就绪/.test(down.get('parseMsg').innerHTML), '要告诉用户为什么不能用')
  ok('服务未就绪 / 名额用完时按钮按掉并说明原因，不会让人点到底')

  const closed = buildPage({ enabled: false, ready: false, remaining: 5, limit: 20, maxChars: 20000 })
  await new Promise((r) => setTimeout(r, 0))
  assert(closed.get('btnParse').disabled, '整体关闭时也要禁用')
  assert(/关闭/.test(closed.get('parseMsg').innerHTML), '要明说已关闭')
  ok('总闸拉下时页面如实显示「已关闭」')

  console.log(`\n公开试用页冒烟通过：${passed} 项`)
}

main().catch((e) => {
  console.error(`\n公开试用页冒烟失败：${e && e.message ? e.message : e}`)
  if (e && e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'))
  process.exit(1)
})
