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
// 5. 真调一次大模型（可选）
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

    if (process.env.WECHAT_ARCHIVE_SMOKE_LLM === '1') {
      console.log('\n[5] 真实大模型')
      await runRealLlm()
    }

    console.log(`\n微信群归档冒烟通过：${passed} 项`)
  } catch (e) {
    console.error(`\n冒烟失败：${e && e.message ? e.message : e}`)
    if (e && e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'))
    process.exit(1)
  }
})()
