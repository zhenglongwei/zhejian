/**
 * 微信群归档转案例 · 冒烟测试（默认不联网，大模型用桩函数替掉）
 * 用法：node backend/scripts/smoke-wechat-archive.js
 * 想真调一次大模型：WECHAT_ARCHIVE_SMOKE_LLM=1 node backend/scripts/smoke-wechat-archive.js
 */
const assert = require('assert')
const {
  parseChat,
  renderMessages,
  maskChatText,
  extractFacts,
  composeCase,
  riskScan,
  parseJsonLoose,
  SECTION_NAMES,
  MASK_RULES,
} = require('../src/services/wechat-archive.service')

let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

// ---------------------------------------------------------------------------
// 1. 解析：微信群聊没有范本，至少这三种形态要吃得住
// ---------------------------------------------------------------------------

console.log('\n[1] 解析')

check('昵称/内容分行 + [图片] 占位', () => {
  const { messages, stats } = parseChat(
    ['张师傅', '李哥，你那个途观过减速带响的问题，今天举起来看了', '[图片]', '[图片]', '李老板', '严重吗？'].join('\n'),
  )
  assert.strictEqual(messages.length, 2, '两条消息')
  assert.strictEqual(messages[0].sender, '张师傅')
  assert.strictEqual(messages[0].image, 2, '两张图归到第一条')
  assert.strictEqual(messages[1].text, '严重吗？')
  assert.strictEqual(stats.imageCount, 2)
  assert.strictEqual(stats.senderCount, 2)
})

check('「昵称：内容」单行格式', () => {
  const { messages } = parseChat('张师傅：右边的小吊杆球头松了\n李老板：那要换什么')
  assert.strictEqual(messages.length, 2)
  assert.strictEqual(messages[0].sender, '张师傅')
  assert.strictEqual(messages[0].text, '右边的小吊杆球头松了')
})

check('带时间戳的导出格式（时间在前 / 在后都要认）', () => {
  const a = parseChat('2026-08-20 10:23 张师傅\n举起来看了')
  assert.strictEqual(a.messages[0].sender, '张师傅', '时间在前时发言人仍要认出来')
  const b = parseChat('张师傅 2026-08-20 10:23\n举起来看了')
  assert.strictEqual(b.messages[0].sender, '张师傅')
  assert.strictEqual(b.messages[0].time, '2026-08-20 10:23')
})

check('语音单独计数——拿不到内容这件事必须让界面报出来', () => {
  const { stats } = parseChat('张师傅\n我语音说吧\n[语音]\n[语音]\n李老板\n好')
  assert.strictEqual(stats.voiceCount, 2, '语音条数不能和消息数混在一起')
})

check('「以下为聊天记录」这类废话行要丢掉', () => {
  const { messages } = parseChat('以下为聊天记录\n张师傅\n车举起来了')
  assert.strictEqual(messages.length, 1)
  assert.strictEqual(messages[0].sender, '张师傅')
})

check('消息改完能原样拼回去（页面上改发言人靠这个）', () => {
  const { messages } = parseChat('张师傅\n举起来看了\n[图片]')
  const text = renderMessages(messages)
  assert(text.includes('张师傅'), '发言人要在')
  assert(text.includes('[图片]'), '图片占位要在')
})

// ---------------------------------------------------------------------------
// 2. 脱敏：隐私一个字都不能出本机
// ---------------------------------------------------------------------------

console.log('\n[2] 脱敏')

check('手机号 / 身份证 / 座机 / 银行卡', () => {
  const { text, hits } = maskChatText('打13812345678，或者0571-88886666，卡号6222021234567890123，证件330106199001011234')
  assert(!text.includes('13812345678'), '手机号没打掉')
  assert(!text.includes('88886666'), '座机没打掉')
  assert(!text.includes('6222021234567890123'), '银行卡没打掉')
  assert(!text.includes('330106199001011234'), '身份证没打掉')
  assert(hits['手机号'] === 1 && hits['身份证'] === 1, '命中统计要报出来')
})

check('车牌要打掉，但车型「途观L」不能被误伤', () => {
  const { text } = maskChatText('浙A12345 的途观L，还有一台浙AD88888')
  assert(text.includes('[车牌]'), '车牌没打掉')
  assert(text.includes('途观L'), '车型被误伤了——车系名是案例必须保留的信息')
  assert(!text.includes('浙A12345') && !text.includes('浙AD88888'))
})

check('VIN 要打掉', () => {
  const { text } = maskChatText('车架号 LSVAU0338N2123456 看一下')
  assert(text.includes('[VIN]'), 'VIN 没打掉')
})

check('精确到门牌的地址要打掉', () => {
  const { text } = maskChatText('车子停在文三路128号门口')
  assert(text.includes('[地址]'), '地址没打掉')
})

check('发言人昵称 → 发言人A/B/C，且正文里的点名一起换掉', () => {
  const { text, senderMapping } = maskChatText('张师傅\n李哥，你那个途观过减速带响\n李老板\n严重吗', {
    senders: ['张师傅', '李老板'],
  })
  assert.strictEqual(senderMapping['张师傅'], '发言人A')
  assert(!text.includes('张师傅'), '真名没换掉')
  assert(!text.includes('李哥'), '正文里的点名没换掉——「哥」也是姓氏的一部分')
  assert(text.includes('发言人A'), '发言人标签丢了，模型就没法推断谁是谁')
})

check('脱敏后的文本再脱一遍不会二次破坏', () => {
  const once = maskChatText('张师傅：打13812345678', { senders: ['张师傅'] }).text
  const twice = maskChatText(once).text
  assert.strictEqual(once, twice, '重复脱敏必须幂等，否则接口侧兜底会毁掉内容')
})

// ---------------------------------------------------------------------------
// 3. 事实提取（大模型用桩，只验证流程与归一化）
// ---------------------------------------------------------------------------

console.log('\n[3] 事实提取')

const CHAT = [
  '张师傅',
  '李哥，你那个浙A12345的途观过减速带响的问题，今天举起来看了',
  '[图片]',
  '[图片]',
  '张师傅',
  '右边的小吊杆球头松了，胶套也裂了',
  '李老板',
  '严重吗？要不要紧',
  '张师傅',
  '暂时不影响安全，但是过坑会响，时间长了会磨摆臂',
  '李老板',
  '那要换什么',
  '张师傅',
  '两个方案：单换小吊杆，一百多一根；换摆臂总成连胶套一起，六百多',
  '张师傅',
  '你这个摆臂还能用，建议先换小吊杆',
  '李老板',
  '行，那就换小吊杆，两边都换。我电话13812345678',
  '[语音]',
  '张师傅',
  '好，两边都换，顺便把定位做了',
  '[图片]',
  '张师傅',
  '旧的拆下来了，你看这胶套裂的',
  '[图片]',
  '张师傅',
  '新的装好了，力矩打到标准',
  '[图片]',
  '张师傅',
  '路试了一下，过减速带不响了',
  '李老板',
  '好的，一共多少',
  '张师傅',
  '小吊杆两根加四轮定位，一共八百六',
].join('\n')

const FAKE_EXTRACT = {
  roles: { 发言人A: '技师', 发言人B: '车主' },
  facts: {
    vehicle: '大众途观',
    odo: '',
    symptom: '过减速带异响',
    checkFindings: ['右前小吊杆球头松旷', '胶套开裂'],
    excluded: ['摆臂本体可用，不需换总成'],
    plan: '更换两侧小吊杆并做四轮定位',
    planReason: '摆臂本体经检查仍可用',
    process: ['举升检查', '拆卸旧件', '安装新件并按标准力矩紧固', '四轮定位'],
    parts: ['小吊杆 ×2'],
    finish: '路试过减速带异响消失',
    duration: '',
    handover: '',
    amount: '860 元',
    photoHints: [{ node: '检查', count: 2, say: '胶套裂了' }],
  },
  timeline: [
    { at: '', who: '车主', what: '反映过减速带异响' },
    { at: '', who: '技师', what: '举升检查发现小吊杆球头松旷' },
    { at: '', who: '车主', what: '确认更换两侧小吊杆' },
    { at: '', who: '技师', what: '完工路试，异响消失' },
  ],
  doubts: [{ field: 'excluded', value: '摆臂本体可用', why: '群里没说"检查了摆臂"，是从"建议先换小吊杆"推断的' }],
  missing: ['里程', '环车预检', '轮毂轴承', '减震器', '交车说明'],
  confidence: 0.72,
  note: '检查发现与方案、完工都有，里程和预检缺失',
}

function stubLlm(payload) {
  return async (messages) => {
    assert(Array.isArray(messages) && messages.length === 2, 'system + user 两条消息')
    const sys = messages[0].content
    // 提示词里的硬规则不能丢，丢了模型就会开始编
    assert(
      sys.includes('禁止用汽修常识补全') || sys.includes('不许编造'),
      '不许编造这条纪律必须在提示词里',
    )
    assert(sys.includes('只输出 JSON'), '必须要求只输出 JSON')
    return { text: JSON.stringify(payload), usage: null }
  }
}

async function runExtract() {
  const data = await extractFacts({ text: CHAT, category: 'chassis_noise' }, { llm: stubLlm(FAKE_EXTRACT) })
  assert.strictEqual(data.facts.vehicle, '大众途观')
  assert.strictEqual(data.facts.checkFindings.length, 2)
  assert.strictEqual(data.doubts.length, 1, '推断出来的项必须进存疑项')
  assert.strictEqual(data.timeline.length, 4)
  assert.strictEqual(data.stats.voiceCount, 1, '语音条数要带到界面上去提醒')
  assert(!data.maskedText.includes('13812345678'), '送模型之前必须脱敏')
  assert(!data.maskedText.includes('浙A12345'), '车牌不能出本机')
  assert.strictEqual(data.maskHits['手机号'], 1)
  assert(data.confidence > 0.7)
}

async function runExtractGuards() {
  await assert.rejects(() => extractFacts({ text: '   ' }, { llm: stubLlm({}) }), /群聊内容是空的/)
  await assert.rejects(
    () => extractFacts({ text: '车'.repeat(30000) }, { llm: stubLlm({}) }),
    /群聊太长/,
    '超长群聊要在送模型之前就拦住，不然 token 白烧',
  )
  const fromMessages = await extractFacts({ messages: [{ sender: '发言人A', text: '举起来看了', image: 1 }] }, { llm: stubLlm(FAKE_EXTRACT) })
  assert(fromMessages.maskedText.includes('举起来看了'), '传 messages 时要能自己拼回文本')
}

// ---------------------------------------------------------------------------
// 4. 生成案例 + 风控
// ---------------------------------------------------------------------------

console.log('\n[4] 生成案例与风控')

const FAKE_CASE = {
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
  aiAbstract: '杭州一台大众途观因过减速带异响到店检查……',
  sourceLabel: '门店发布 · 已脱敏 · 已审核',
}

async function runCompose() {
  const data = await composeCase(
    { facts: FAKE_EXTRACT.facts, city: '杭州', district: '西湖区', category: 'chassis_noise' },
    { llm: stubLlm(FAKE_CASE) },
  )
  assert.strictEqual(data.sections.length, 9, '九段一个都不能少')
  assert.deepStrictEqual(
    data.sections.map((s) => s.name),
    SECTION_NAMES,
    '九段顺序必须跟《07》一致',
  )
  assert.strictEqual(data.sourceLabel, '门店发布 · 已脱敏 · 已审核', '信源标识按 22 D2')
  assert.strictEqual(data.risk.length, 0, '干净文案不该报风控')
}

async function runComposeMissingSections() {
  const data = await composeCase(
    { facts: { vehicle: '大众途观' }, city: '杭州' },
    {
      llm: stubLlm({
        title: '杭州 大众途观 底盘异响检修',
        sections: [{ name: '案例概况', text: '一次底盘异响检修。' }],
      }),
    },
  )
  assert.strictEqual(data.sections.length, 9, '模型少给几段也要补齐，不许静默丢段')
  assert.strictEqual(data.sections[1].text, '', '补的段留空，让人自己填，不要替他编')
}

async function runComposeGuard() {
  await assert.rejects(() => composeCase({ facts: {} }, { llm: stubLlm({}) }), /还没有可确认的事实/)
}

function checkRisk() {
  check('风控：金额写进公开文案必须被抓出来', () => {
  const dirty = {
    title: '杭州 大众途观 底盘异响检修',
    summary: '一共八百六十元，包工时。',
    sections: [{ name: '完工效果', text: '修好了，收费 860 元。' }],
    captions: [{ node: '检查结果', text: '右前小吊杆球头 松旷' }],
    faq: [{ q: '多少钱？', a: '1560元' }],
    aiAbstract: '本次维修费用约 860 元。',
  }
  const risk = riskScan(dirty)
  const types = risk.map((r) => r.type)
  assert(types.includes('金额'), '金额没被抓出来——公域藏价是硬红线（07 §4.3）')
  assert(risk.length >= 4, `金额出现在四个地方都应报，实际 ${risk.length}`)
  assert(risk.some((r) => r.field === '正文·完工效果'), '要能定位到是哪一段出的问题')
})

check('风控：车牌/手机号同样要抓', () => {
  const risk = riskScan({ title: '浙A12345 大众途观检修', summary: '联系13812345678' })
  assert(risk.some((r) => r.type === '车牌'), '车牌没抓到')
  assert(risk.some((r) => r.type === '手机号'), '手机号没抓到')
})
}

function checkJsonParse() {
  check('模型输出的 JSON 带围栏/废话也要能解析', () => {
  const obj = parseJsonLoose('好的，这是结果：\n```json\n{"a":1}\n```\n希望有帮助')
  assert.strictEqual(obj.a, 1)
  const obj2 = parseJsonLoose('{"a":2}')
  assert.strictEqual(obj2.a, 2)
  assert.throws(() => parseJsonLoose(''), /EMPTY_LLM_OUTPUT/)
  assert.throws(() => parseJsonLoose('这不是 JSON'), /BAD_JSON/)
})
}

// ---------------------------------------------------------------------------
// 5. 公开试用路由：不要密钥，但必须限流 + 能拉闸
// ---------------------------------------------------------------------------

const fs = require('fs')
const path = require('path')
const http = require('http')
const express = require('express')
const { config } = require('../src/config')
const publicArchive = require('../src/routes/public-wechat-archive')

function startTestServer() {
  const app = express()
  app.use(express.json())
  app.use('/api/v1/public', publicArchive.router)
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}/api/v1/public/wechat-archive` })
    })
  })
}

async function call(base, p, body, headers) {
  const res = await fetch(base + p, {
    method: body === undefined ? 'GET' : 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

const CHAT_SHORT = '张师傅\n李哥，途观过减速带响，今天举起来看了\n[图片]\n李老板\n严重吗？'

async function runPublicRoute() {
  // 配额调小才能测到边界。跑完要还原，别影响同一进程里的其它用例。
  const saved = {
    enabled: config.wechatArchive.enabled,
    perIp: config.wechatArchive.publicPerIpPerDay,
    cap: config.wechatArchive.publicDailyCap,
    parse: config.wechatArchive.publicParsePerIpPerDay,
  }
  config.wechatArchive.enabled = true
  config.wechatArchive.publicPerIpPerDay = 2
  config.wechatArchive.publicParsePerIpPerDay = 3
  config.wechatArchive.publicDailyCap = 4

  const { server, base } = await startTestServer()
  const ip = (n) => ({ 'x-forwarded-for': `203.0.113.${n}` })
  try {
    // 1) 不拿密钥也能用
    const st = await call(base, '/status')
    assert.strictEqual(st.json.code, 0, '公开 status 不该要密钥')
    assert.strictEqual(st.json.data.enabled, true)
    assert.strictEqual(st.json.data.retention, '不保存任何粘贴内容', '不落库这句诺言要跟着接口走')
    assert.strictEqual(st.json.data.remaining, 2)

    // 2) parse 不调模型，不该吃掉主配额
    for (let i = 0; i < 3; i += 1) {
      const r = await call(base, '/parse', { text: CHAT_SHORT }, ip(11))
      assert.strictEqual(r.json.code, 0, `第 ${i + 1} 次解析应成功`)
    }
    const afterParse = await call(base, '/status', undefined, ip(11))
    assert.strictEqual(afterParse.json.data.remaining, 2, '解析三次后主配额必须还是满的')

    // 3) parse 超额 → 429
    const overParse = await call(base, '/parse', { text: CHAT_SHORT }, ip(11))
    assert.strictEqual(overParse.status, 429, '解析超额要返回 429')
    assert.strictEqual(overParse.json.code, 42901)

    // 4) 主配额耗尽 → 429（本地没配 key，前两次会 503，但配额照扣）
    for (let i = 0; i < 2; i += 1) {
      const r = await call(base, '/extract', { text: CHAT_SHORT }, ip(12))
      assert([0, 50310].includes(r.json.code), `第 ${i + 1} 次主流程应扣到配额（实际 ${r.json.code}）`)
    }
    const overLlm = await call(base, '/extract', { text: CHAT_SHORT }, ip(12))
    assert.strictEqual(overLlm.status, 429, '主配额用完要返回 429')
    assert.strictEqual(overLlm.json.code, 42901)

    // 5) 全局总闸：前面 IP 11/12 已消耗 2 次主配额，总闸设的 4
    //    再换两个 IP 各来一次就满了，第 5 个 IP 应该被挡在门外
    await call(base, '/extract', { text: CHAT_SHORT }, ip(13))
    await call(base, '/extract', { text: CHAT_SHORT }, ip(14))
    const capped = await call(base, '/extract', { text: CHAT_SHORT }, ip(15))
    assert.strictEqual(capped.json.code, 42901, '总闸满了要挡住')
    assert(/名额已经用完/.test(capped.json.message), `总闸文案要区分于个人额度（实际：${capped.json.message}）`)

    // 总闸满了不该顺带扣掉这个 IP 自己的额度——它明天还要用
    const cappedStatus = await call(base, '/status', undefined, ip(15))
    assert.strictEqual(cappedStatus.json.data.remaining, 0, '总闸满了页面要显示 0 次可用')
    assert.strictEqual(cappedStatus.json.data.ready, false, '总闸满了 ready 要为 false')

    // 6) 上游报错不许原样吐给外人。
    //    光靠「本地没配密钥」测不到这条——那种情况走的是 LLM_NOT_CONFIGURED。
    //    这里起一个假上游，专门返回 401 + 阿里云风格的错误体。
    config.wechatArchive.enabled = true
    // 前面的用例已经把总闸耗到 0 了，这里只想测错误映射，先把总闸放开
    config.wechatArchive.publicDailyCap = 999
    const savedKey = config.wechatArchive.apiKey
    const savedUrl = config.wechatArchive.apiUrl
    const upstream = http.createServer((req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: { message: 'Incorrect API key provided. For details, see: https://help.aliyun.com/zh/model-studio/error-code#apikey-error' },
        }),
      )
    })
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    config.wechatArchive.apiKey = 'definitely-wrong-key'
    config.wechatArchive.apiUrl = `http://127.0.0.1:${upstream.address().port}/chat/completions`
    try {
      const boom = await call(base, '/extract', { text: CHAT_SHORT }, ip(21))
      assert.strictEqual(boom.status, 503, `上游故障要返回 503，实际 ${boom.status}`)
      assert.strictEqual(boom.json.code, 50310)
      assert(
        !/Incorrect API key|dashscope|aliyun|Bearer|help\./i.test(boom.json.message),
        `公开接口把上游原话漏出去了：「${boom.json.message}」`,
      )
      assert(boom.json.message.length < 30, '给外人看的错误文案要短')
    } finally {
      upstream.close()
      config.wechatArchive.apiKey = savedKey
      config.wechatArchive.apiUrl = savedUrl
    }

    // 7) 拉闸：enabled=false 后除 status 外全部 403
    config.wechatArchive.enabled = false
    const offStatus = await call(base, '/status')
    assert.strictEqual(offStatus.json.data.enabled, false, 'status 在关闭时仍要能问')
    const offParse = await call(base, '/parse', { text: CHAT_SHORT }, ip(16))
    assert.strictEqual(offParse.status, 403, '拉闸后 parse 必须 403')
    const offExtract = await call(base, '/extract', { text: CHAT_SHORT }, ip(16))
    assert.strictEqual(offExtract.status, 403, '拉闸后 extract 必须 403，不然保险丝是假的')
  } finally {
    server.close()
    Object.assign(config.wechatArchive, {
      enabled: saved.enabled,
      publicPerIpPerDay: saved.perIp,
      publicDailyCap: saved.cap,
      publicParsePerIpPerDay: saved.parse,
    })
  }
}

// ---------------------------------------------------------------------------
// 6. 前后端脱敏规则漂移
//     浏览器那份是「原文不出本机」的唯一保障。它一旦比服务端少一条规则，
//     手机号/车牌就会以明文飞出用户的电脑——而页面还写着「先在你自己电脑上脱敏」。
// ---------------------------------------------------------------------------

function loadBrowserRules() {
  const p = path.join(__dirname, '..', '..', 'brand-web', 'js', 'archive.js')
  const src = fs.readFileSync(p, 'utf8')
  const start = src.indexOf('var MASK_RULES = [')
  const end = src.indexOf('function renderMessages')
  assert(start > -1 && end > start, '浏览器端找不到 MASK_RULES…parseChat 区块，页面结构变了，这段检查要跟着改')
  // eslint-disable-next-line no-new-func
  return new Function(`${src.slice(start, end)}\nreturn { MASK_RULES, parseChat, maskText };`)()
}

function checkBrowserParity() {
  check('脱敏规则逐条比对：条数 / 顺序 / 正则 / 替换值', () => {
    const b = loadBrowserRules()
    const a = MASK_RULES
    assert.strictEqual(
      b.MASK_RULES.length,
      a.length,
      `前端 ${b.MASK_RULES.length} 条 vs 服务端 ${a.length} 条，规则漂移了`,
    )
    a.forEach((r, i) => {
      const br = b.MASK_RULES[i]
      assert.strictEqual(br.name, r.name, `第 ${i + 1} 条规则名不一致`)
      assert.strictEqual(br.re.source, r.re.source, `规则「${r.name}」的正则不一致`)
      assert.strictEqual(br.re.flags, r.re.flags, `规则「${r.name}」的 flags 不一致`)
      assert.strictEqual(br.to, r.to, `规则「${r.name}」的替换值不一致`)
    })
  })

  check('同一个群聊，前后端解析结果必须一模一样', () => {
    const b = loadBrowserRules()
    const samples = [
      CHAT,
      CHAT_SHORT,
      '张师傅：右边的小吊杆球头松了\n李老板：那要换什么',
      '2026-08-20 10:23 张师傅\n举起来看了\n[语音]\n李老板 10:25\n好',
    ]
    samples.forEach((raw, i) => {
      // idx 是服务端为落库加的序号，前端不需要，比对时归一掉
      const strip = (r) => ({
        senders: r.senders,
        stats: r.stats,
        messages: r.messages.map((m) => {
          const o = {}
          Object.keys(m).filter((k) => k !== 'idx').sort().forEach((k) => { o[k] = m[k] })
          return o
        }),
      })
      assert.deepStrictEqual(
        strip(b.parseChat(raw)),
        strip(parseChat(raw)),
        `第 ${i + 1} 份样本的解析结果前后端不一致`,
      )
    })
  })

  check('脱敏结果前后端一致：原文里的手机号/车牌两边都得没', () => {
    const b = loadBrowserRules()
    const raw = '张师傅\n李哥 13812345678，你那辆浙A12345今天举起来看了\n李老板\n八百六十块能搞定吗'
    const parsed = parseChat(raw)
    const serverOut = maskChatText(raw, { senders: parsed.senders }).text
    const browserOut = b.maskText(raw, parsed.senders).text
    assert.strictEqual(browserOut, serverOut, '前后端脱敏输出不一致')
    assert(!browserOut.includes('13812345678'), '前端脱敏漏了手机号')
    assert(!browserOut.includes('浙A12345'), '前端脱敏漏了车牌')
  })
}

// ---------------------------------------------------------------------------
// 7. 真调一次大模型（可选）
// ---------------------------------------------------------------------------

async function runRealLlm() {
  const data = await extractFacts({ text: CHAT, category: 'chassis_noise' })
  assert(data.facts, '真调要能拿到 facts')
  console.log(`  ✓ 真实大模型可用（model=${data.facts ? 'ok' : ''}，confidence=${data.confidence}）`)
  const cased = await composeCase({ facts: data.facts, city: '杭州', category: 'chassis_noise' })
  assert(cased.title, '真调要能拿到标题')
  console.log(`  ✓ 真实生成标题：${cased.title}`)
  if (cased.risk.length) console.log(`  ! 风控命中（需人工处理）：${JSON.stringify(cased.risk)}`)
}

// ---------------------------------------------------------------------------

;(async () => {
  try {
    checkRisk()
    checkJsonParse()
    await runExtract()
    console.log('  ✓ 群聊 → 事实（脱敏 / 归一化 / 存疑项）')
    passed += 1
    await runExtractGuards()
    console.log('  ✓ 提取阶段的输入护栏')
    passed += 1
    await runCompose()
    console.log('  ✓ 事实 → 案例九段（对齐 07）')
    passed += 1
    await runComposeMissingSections()
    console.log('  ✓ 九段缺失时补齐留空，不替人编')
    passed += 1
    await runComposeGuard()
    console.log('  ✓ 生成阶段的输入护栏')
    passed += 1

    console.log('\n[5] 公开试用路由')
    await runPublicRoute()
    console.log('  ✓ 不要密钥即可用 + 解析不占主配额')
    passed += 1
    console.log('  ✓ 个人额度 / 全局总闸 / 总闸满了不误扣个人额度')
    passed += 1
    console.log('  ✓ 拉闸后接口真停（status 仍可问）')
    passed += 1

    console.log('\n[6] 前后端脱敏规则一致性')
    checkBrowserParity()

    if (process.env.WECHAT_ARCHIVE_SMOKE_LLM === '1') {
      console.log('\n[7] 真实大模型')
      await runRealLlm()
    }

    console.log(`\n微信群归档冒烟通过：${passed} 项`)
  } catch (e) {
    console.error(`\n冒烟失败：${e && e.message ? e.message : e}`)
    if (e && e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'))
    process.exit(1)
  }
})()
