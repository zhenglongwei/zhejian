/**
 * 微信群归档 → 公开案例
 *
 * 目标定义见 docs/04_维修过程相册/22_微信群归档转案例目标定义.md，案例规范见 07_案例生成规则.md。
 * 这个服务只干三段事：
 *
 *   ① parseChat     把粘贴进来的群聊切成一条条消息（发言人 / 内容 / 图片 / 语音）
 *   ② maskChatText  本地脱敏，手机号车牌身份证 VIN 姓名全部换成占位符
 *   ③ extractFacts  脱敏后的全文交给大模型理解整合 → 事实层 / 过程层 / 存疑项
 *   ④ composeCase   人工确认过的事实 → 按《07》生成标题 / 摘要 / 正文九段 / 图说 / 本单问答
 *
 * 四条红线（都是文档里定死的，改代码前先读）：
 *   1. 先脱敏，再送大模型。未脱敏的原文不许出本机。顺序反了整个方案就不成立。
 *   2. 不许编造（07 §1.3）。群里没说的一律留空，不许用汽修常识补全；推断出来的必须进存疑项。
 *   3. 公域藏价（07 §4.3）。金额可以提取到 facts.amount 供内档参考，但绝不进公开文案。
 *   4. 不做规则匹配提取（22 D3）。真实群聊没有范本，17 的检查项只是喂给模型的"事实清单"，
 *      不是让代码去正则命中。
 */

const { config } = require('../config')
const { chatCompletion } = require('../lib/dashscope-chat')

/** 群聊里常见的占位符，解析时单独计数 */
const PLACEHOLDER_MAP = {
  图片: 'image',
  照片: 'image',
  视频: 'video',
  小视频: 'video',
  语音: 'voice',
  动画表情: 'sticker',
  表情: 'sticker',
  文件: 'file',
  链接: 'link',
  聊天记录: 'forward',
  位置: 'location',
  名片: 'card',
}

const PLACEHOLDER_RE = /^\[(图片|照片|视频|小视频|语音|动画表情|表情|文件|链接|聊天记录|位置|名片)\]$/

/** 导出/复制时夹带的废话行 */
const NOISE_LINE_RE =
  /^(以下(为|是)?(聊天记录|新消息|历史消息)|以上(为|是)?(聊天记录|是新消息|为历史消息)|-{2,}|—{2,}|聊天记录截图|\[聊天记录\])/

const TIME_ONLY_RE =
  /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?|\d{1,2}:\d{2}(?::\d{2})?|昨天\s?\d{1,2}:\d{2}|前天\s?\d{1,2}:\d{2}|星期[一二三四五六日天]\s?\d{1,2}:\d{2})$/

/** 「张师傅 2026-08-20 10:23」——发言人在前，时间在后 */
const SENDER_THEN_TIME_RE =
  /^(.{1,20}?)[\s\u00A0]+((?:\d{4}[-/]\d{1,2}[-/]\d{1,2}\s?)?\d{1,2}:\d{2}(?::\d{2})?)$/
/** 「2026-08-20 10:23 张师傅」——时间在前，发言人在后 */
const TIME_THEN_SENDER_RE =
  /^((?:\d{4}[-/]\d{1,2}[-/]\d{1,2}\s?)?\d{1,2}:\d{2}(?::\d{2})?|昨天\s?\d{1,2}:\d{2}|前天\s?\d{1,2}:\d{2})[\s\u00A0]+(.{1,20})$/

/**
 * 脱敏规则表。顺序有意义：长的、特征强的先上。
 * 每条给出 { name, re, to }，re 必须带 g。
 */
const MASK_RULES = [
  { name: '身份证', re: /\b\d{17}[\dXx]\b/g, to: '[身份证]' },
  { name: '手机号', re: /\b1[3-9]\d{9}\b/g, to: '[手机号]' },
  { name: '座机', re: /\b0\d{2,3}-?\d{7,8}\b/g, to: '[电话]' },
  { name: '银行卡', re: /\b\d{16,19}\b/g, to: '[银行卡]' },
  {
    // 车牌：省份简称 + 发牌机关字母 + 序号。必须含数字，否则「途观L」这类车型会被误伤。
    name: '车牌',
    re: /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z](?=[A-HJ-NP-Z0-9]{4,6}\d)[A-HJ-NP-Z0-9]{4,6}[挂学警港澳领]?/g,
    to: '[车牌]',
  },
  {
    // VIN：17 位，不含 I/O/Q，且字母数字混合。纯数字串不是 VIN。
    name: 'VIN',
    re: /\b(?=[A-HJ-NPR-Z0-9]{17}\b)(?=[A-HJ-NPR-Z0-9]*[A-HJ-NPR-Z])(?=[A-HJ-NPR-Z0-9]*\d)[A-HJ-NPR-Z0-9]{17}\b/g,
    to: '[VIN]',
  },
  {
    // 地址：到「路/街/道 + 号」或「小区 + 栋/单元」才算，避免把「长江大道」这种词打掉
    name: '地址',
    re: /[\u4e00-\u9fa5]{2,10}(?:路|街|道|巷|弄)\d{1,4}号[\u4e00-\u9fa5\d]{0,8}|[\u4e00-\u9fa5]{2,12}(?:小区|花园|家园|公寓|大厦|苑)\d{0,4}(?:栋|幢|座)?\d{0,4}(?:单元|室|层)?/g,
    to: '[地址]',
  },
  {
    // 群聊里点名用的称呼：「李哥」「王总」「张师傅」。发言人另有映射，这里兜底处理正文里的点名。
    name: '称呼',
    re: /[\u4e00-\u9fa5]{1,2}(?:师傅|老板|总|哥|姐|先生|女士|小姐|阿姨|大叔|经理|店长)/g,
    to: '[称呼]',
  },
]

/** 风控扫描：生成出来的公开文案里不许出现这些（07 §4.1 §4.3） */
const RISK_RULES = [
  { type: '手机号', re: /\b1[3-9]\d{9}\b/ },
  { type: '身份证', re: /\b\d{17}[\dXx]\b/ },
  { type: '车牌', re: /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z][A-HJ-NP-Z0-9]{4,6}[挂学警港澳领]?/ },
  { type: '金额', re: /\d[\d,]*\.?\d*\s?(?:元|块|块钱|万|万块|w)/ },
  { type: '金额', re: /(?:一共|总共|合计|花了|收费|报价|多少钱)[^\n。；]{0,10}\d{2,}/ },
  {
    // 中文数字金额。群里说「八百六」「一千二块」比说「860」更常见，只查阿拉伯数字会漏。
    type: '金额',
    re: /[一二三四五六七八九十百千万两贰叁肆伍陆柒捌玖拾佰仟]{1,10}\s?多?\s?(?:块钱|块|元|万)/,
  },
  { type: '身份证', re: /\b\d{16,19}\b/ },
]

/** 17 的检查项，在 extract 阶段降级为「事实清单参考词表」，不是必须填满的目标结构（22 D1） */
const CATEGORY_ITEMS = {
  chassis_noise: [
    ['complaint', '异响场景：什么情况下响（过减速带、转弯、刹车、走烂路）'],
    ['bushing_closeup', '胶套/球头近景：有没有说胶套裂了、球头松了'],
    ['sway_bar_links', '稳定杆连杆（小吊杆）/胶套'],
    ['repair_path', '处理路径：换小吊杆还是换摆臂总成，理由是什么'],
    ['old_parts', '旧件留影：旧件拆下来有没有拍、说了什么'],
    ['road_test_after', '完工路试：修完试车了吗，还响不响'],
    ['alignment_advice', '换件后定位：有没有建议做四轮定位'],
    ['press_torque', '压装/力矩：有没有提到按标准力矩紧固'],
    ['exclude_list', '已排除项：明确说了哪些件不用换、还能用'],
    ['road_test_before', '试车复现：维修前有没有试车确认异响'],
    ['pry_play_check', '撬动/旷量检查：有没有举起来撬、查旷量'],
    ['parts_used', '配件信息：原厂/副厂/品牌'],
    ['odo', '里程表读数'],
    ['walkaround', '环车预检'],
    ['wheel_bearing', '轮毂轴承检查结论'],
    ['shock_strust', '减震器/顶胶检查结论'],
    ['handover_note', '交车说明/注意事项'],
  ],
}

const CATEGORY_LABELS = { chassis_noise: '底盘异响' }

function clipText(value, max) {
  return String(value == null ? '' : value).slice(0, max)
}

function toArray(value, maxItems = 12, maxLen = 200) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : String(item?.text ?? item?.value ?? item?.name ?? '')))
      .map((item) => clipText(item, maxLen).trim())
      .filter(Boolean)
      .slice(0, maxItems)
  }
  const text = clipText(value, maxLen).trim()
  return text ? [text] : []
}

// ---------------------------------------------------------------------------
// ① 解析
// ---------------------------------------------------------------------------

/**
 * 把粘贴进来的群聊切成消息数组。
 * 微信群聊没有范本——有的带时间有的不带，有的「昵称：内容」有的「昵称\n内容」，
 * 所以这里是启发式：短且无句读的行当发言人，带时间的行先拆时间，其余当正文。
 *
 * 这个函数的输出要给页面上人工改（v0.1 的缺陷就是解析完不能改），所以宁可猜错也不能吞内容。
 */
function parseChat(raw) {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00A0/g, ' ').trimEnd())
  const messages = []
  let cur = null
  let pendingTime = ''

  const flush = () => {
    if (cur && (cur.text || cur.image || cur.voice || cur.video || cur.file)) messages.push(cur)
    cur = null
  }
  const ensure = () => {
    if (!cur) cur = { idx: messages.length, sender: '', time: pendingTime || '', text: '', image: 0, voice: 0, video: 0, file: 0 }
    return cur
  }
  const isSenderCandidate = (line) =>
    line.length > 0 &&
    line.length <= 20 &&
    !/[。！？；，,.?!;]/.test(line) &&
    !/^[\d[\]]/.test(line)

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (NOISE_LINE_RE.test(line)) continue

    // 纯占位符：图片 / 语音 / 视频 / 文件
    const ph = line.match(PLACEHOLDER_RE)
    if (ph) {
      const kind = PLACEHOLDER_MAP[ph[1]]
      const msg = ensure()
      if (kind === 'image') msg.image += 1
      else if (kind === 'voice') msg.voice += 1
      else if (kind === 'video') msg.video += 1
      else if (kind === 'file') msg.file += 1
      else msg.text += (msg.text ? '\n' : '') + line
      continue
    }

    if (TIME_ONLY_RE.test(line)) {
      pendingTime = line
      flush()
      continue
    }

    // 「张师傅 10:23」/「2026-08-20 10:23 张师傅」
    const senderTime = line.match(SENDER_THEN_TIME_RE)
    if (senderTime && senderTime[1].trim()) {
      flush()
      pendingTime = senderTime[2]
      ensure().sender = senderTime[1].trim()
      continue
    }
    const timeSender = line.match(TIME_THEN_SENDER_RE)
    if (timeSender && timeSender[2].trim()) {
      flush()
      pendingTime = timeSender[1]
      ensure().sender = timeSender[2].trim()
      continue
    }

    // 「张师傅：内容」
    const colon = line.match(/^(.{1,20}?)\s?[：:]\s?(.*)$/)
    if (colon && colon[1].trim() && isSenderCandidate(colon[1].trim())) {
      flush()
      ensure().sender = colon[1].trim()
      if (colon[2].trim()) ensure().text = colon[2].trim()
      continue
    }

    // 上一条已经有正文了，这一行又短又像名字 → 当成新发言人
    if (!cur || (cur.text && isSenderCandidate(line))) {
      flush()
      ensure().sender = line
      continue
    }
    // 上一条只有时间没有发言人 → 这一行是发言人
    if (cur && !cur.sender && !cur.text && isSenderCandidate(line)) {
      cur.sender = line
      continue
    }
    const msg = ensure()
    msg.text += (msg.text ? '\n' : '') + line
  }
  flush()

  const senders = [...new Set(messages.map((m) => m.sender).filter(Boolean))]
  return {
    messages: messages.map((m, i) => ({ ...m, idx: i, time: m.time || '' })),
    stats: {
      messageCount: messages.length,
      senderCount: senders.length,
      imageCount: messages.reduce((a, m) => a + m.image, 0),
      voiceCount: messages.reduce((a, m) => a + m.voice, 0),
      videoCount: messages.reduce((a, m) => a + m.video, 0),
    },
    senders,
  }
}

/** 消息数组还原成文本（页面上改完之后回传用） */
function renderMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((m) => {
      let out = ''
      if (m.sender) out += `${m.sender}${m.time ? ` ${m.time}` : ''}\n`
      else if (m.time) out += `${m.time}\n`
      if (m.text) out += `${m.text}\n`
      for (let i = 0; i < Number(m.image || 0); i += 1) out += '[图片]\n'
      for (let i = 0; i < Number(m.voice || 0); i += 1) out += '[语音]\n'
      for (let i = 0; i < Number(m.video || 0); i += 1) out += '[视频]\n'
      for (let i = 0; i < Number(m.file || 0); i += 1) out += '[文件]\n'
      return out.trimEnd()
    })
    .filter(Boolean)
    .join('\n')
}

// ---------------------------------------------------------------------------
// ② 脱敏
// ---------------------------------------------------------------------------

/**
 * 文本脱敏。顺序不能反：先换掉发言人昵称（保住"谁说的"这个信息），再上正则表。
 *
 * 昵称换成「发言人A/B/C」而不是直接抹掉——模型要靠同一个发言人前后说了什么来推断他是技师还是车主，
 * 全抹成 [称呼] 就把对话结构毁了；但真名一个字都不能留（07 §4.1）。
 */
function maskChatText(raw, options = {}) {
  const senders = Array.isArray(options.senders) ? options.senders : []
  let text = String(raw || '')
  const hits = {}

  const bump = (name, n = 1) => {
    hits[name] = (hits[name] || 0) + n
  }

  // 昵称 → 发言人A/B/C。长的先替换，避免「张师傅」被「张」抢先命中。
  const mapping = {}
  const ordered = [...new Set(senders.filter(Boolean))].sort((a, b) => b.length - a.length)
  ordered.forEach((sender, i) => {
    const label = `发言人${String.fromCharCode(65 + i)}` // A/B/C…
    mapping[sender] = label
    const re = new RegExp(sender.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    text = text.replace(re, (matched) => {
      bump('发言人', 1)
      return label
    })
    if (i >= 25) return // 到 Z 为止，再多就不是"群聊"了
  })

  for (const rule of MASK_RULES) {
    text = text.replace(rule.re, (matched) => {
      bump(rule.name, 1)
      return rule.to
    })
  }

  return { text, hits, senderMapping: mapping }
}

/** 兜底：接口侧再脱一遍，防止页面改过之后把隐私又改回来 */
function ensureMasked(text) {
  return maskChatText(text).text
}

// ---------------------------------------------------------------------------
// ③ 事实提取
// ---------------------------------------------------------------------------

function categoryItemsPrompt(category) {
  const items = CATEGORY_ITEMS[category] || []
  if (!items.length) return '（该类目暂无检查项清单，按通用维修事实提取）'
  return items.map(([key, desc]) => `- ${key}：${desc}`).join('\n')
}

function extractSystemPrompt() {
  return [
    '你是汽修门店的案例整理员。任务：把一段微信群里关于一次维修的聊天记录，整理成结构化的事实。',
    '',
    '硬规则（违反任何一条，输出作废）：',
    '1. 只提取聊天记录里真实出现过的信息。没提到的字段一律留空字符串或空数组。',
    '2. 禁止用汽修常识补全。比如群里没说"检查了轮毂轴承"，就不能写"轮毂轴承正常"——没提等于没有，不许反推。',
    '3. 需要推断才能得出的结论，写进字段里同时必须在 doubts 里说明推断依据；推断依据不足的，宁可留空。',
    '4. 金额（多少钱、报价、共计）提取到 facts.amount，只供门店内部留档，绝不会写进公开文案。群里没说就留空。',
    '5. 车型只写品牌+车系，去掉年款、排量、车牌、颜色。',
    '6. 说话人角色从对话内容推断：描述故障现象/问要不要紧/拍板的是车主，描述检查结果/给方案/施工的是技师。推断不出来写"其他"。',
    '',
    '聊天记录的形态说明（很重要，别按模板硬套）：',
    '- 有的消息是「图+说明」，有的只有一句话，有的可能是语音转文字（断断续续、有错别字）。',
    '- 参与人可能有车主和两三个技师，方案可能来回沟通好几次，确认过程可能跨好几天。',
    '- 「[图片]」「[语音]」「[视频]」是占位符，原始内容拿不到，不要假设图里有什么。',
    '- 没有时间戳是正常的，timeline 里的 at 留空即可。',
    '',
    '只输出 JSON，不要任何解释文字、不要 markdown 代码块标记。',
  ].join('\n')
}

function extractUserPrompt({ text, stats, senders, category }) {
  return [
    `本次维修类目：${CATEGORY_LABELS[category] || category}（${category}）`,
    `参与人（已脱敏）：${(senders || []).join('、') || '未知'}`,
    `消息 ${stats?.messageCount || 0} 条；图片 ${stats?.imageCount || 0} 张；语音 ${stats?.voiceCount || 0} 条（语音拿不到内容）。`,
    '',
    '可参考的事实清单（只是提醒你群里可能出现哪些事实，不是必须填满；群里没说的不要硬凑）：',
    categoryItemsPrompt(category),
    '',
    '输出 JSON，结构如下：',
    '{',
    '  "roles": { "发言人A": "技师|车主|其他" },',
    '  "facts": {',
    '    "vehicle": "品牌+车系，没有则空",',
    '    "odo": "里程，没有则空",',
    '    "symptom": "车主描述的故障现象一句话",',
    '    "checkFindings": ["检查发现1", "检查发现2"],',
    '    "excluded": ["明确说不用换/还能用的件"],',
    '    "plan": "最终采用的维修方案",',
    '    "planReason": "为什么选这个方案",',
    '    "process": ["施工步骤1", "施工步骤2"],',
    '    "parts": ["用到的配件"],',
    '    "finish": "完工验证结果（路试/复检）",',
    '    "duration": "工期，没说则空",',
    '    "handover": "交车说明/注意事项，没有则空",',
    '    "amount": "金额，没有则空",',
    '    "photoHints": [{ "node": "检查|旧件|新件|施工|完工", "count": 2, "say": "群里配图时说了什么" }]',
    '  },',
    '  "timeline": [{ "at": "时间，无则空", "who": "技师|车主", "what": "这一步发生了什么" }],',
    '  "doubts": [{ "field": "字段名", "value": "值", "why": "为什么不确定" }],',
    '  "missing": ["群里没提到、无法确认的项"],',
    '  "confidence": 0.0,',
    '  "note": "一句话说明这段群聊的信息完整度"',
    '}',
    '',
    'timeline 只留 3–5 个关键节点。以下是聊天记录：',
    '---',
    text,
    '---',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// ④ 生成案例
// ---------------------------------------------------------------------------

const SECTION_NAMES = [
  '案例概况',
  '维修前情况',
  '检查结果',
  '维修方案',
  '维修过程',
  '完工效果',
  '价格影响因素',
  '门店说明',
  '温馨提示',
]

function composeSystemPrompt() {
  return [
    '你是汽修门店的案例文案。任务：把一份已经人工确认过的事实，写成一篇公开案例。',
    '',
    '硬规则（违反任何一条，输出作废）：',
    '1. 不许编造。只能用给定事实，事实里没有的一律不写；没给的信息用降级话术，不要自行发挥。',
    '2. 公域藏价：任何情况下不写金额、不写报价、不写"几百""一千多"这类暗示数字。价格段落统一写"价格需根据检测结果确认"。',
    '3. 不夸大：禁止"保证修好""永不复发""全网最低""绝对""一定"等绝对化用语，禁止承诺质保期限（事实里没有就不写）。',
    '4. 不泄露隐私：不得出现姓名、手机号、车牌、VIN、精确地址。',
    '5. 字段缺失处理：车型缺失用"该车辆"；里程缺失不写里程；检查结果缺失写"门店根据车辆实际情况进行了检查"；方案缺失用"门店根据检测结果与车主沟通后确定维修方案"；图片节点缺失就不生成对应图说。',
    '6. 图说：每张公开配图最多一行，只写「项名 + 结果」（如"右前小吊杆球头 松旷"）。没有文字依据的一律留空，禁止"本图为…""具体以图中为准"这类空话。',
    '7. FAQ：只从本单事实里抽用户会问、且这单已有答案的问题，最多 5 条，没有就不出（可以是空数组）。禁止写通用百科问答。',
    '',
    '标题格式（07 §5.0）：【城市】【车型】【项目】：【这次做了什么，至多三项】。',
    '车型缺失时降级为：【城市】【项目】：【这次做了什么】。不要写门店全称、门牌路名、车牌。',
    '',
    '信源标识固定为：门店发布 · 已脱敏 · 已审核',
    '',
    '只输出 JSON，不要任何解释文字、不要 markdown 代码块标记。',
  ].join('\n')
}

function composeUserPrompt({ facts, city, district, category }) {
  return [
    `城市：${city || '（未填）'}　城区：${district || '（未填，标题里可省略）'}`,
    `服务类目：${CATEGORY_LABELS[category] || category || '（未指定）'}`,
    '',
    '已确认事实（JSON）：',
    JSON.stringify(facts, null, 2),
    '',
    '输出 JSON，结构如下：',
    '{',
    '  "title": "按上面的标题格式",',
    '  "summary": "120–200 字：车型 + 症状 + 这次做了什么 + 结果（有才写）。不写金额、不写施工 5S、不写门店自夸。",',
    '  "sections": [{ "name": "案例概况", "text": "…" }]，必须包含且只包含这九段：' +
      SECTION_NAMES.join('、'),
    '  "captions": [{ "node": "检查结果", "text": "右前小吊杆球头 松旷" }],',
    '  "faq": [{ "q": "…", "a": "…" }],',
    '  "aiAbstract": "150–300 字，给 AI 检索引用用：这段文字讲了一次什么车、什么问题、查到什么、怎么修的、结果如何。客观陈述，不带营销话术。",',
    '  "sourceLabel": "门店发布 · 已脱敏 · 已审核"',
    '}',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// 大模型调用
// ---------------------------------------------------------------------------

/** 模型喜欢给 JSON 套 ```json 围栏，也可能前后加两句废话。剥掉再解析。 */
function parseJsonLoose(text) {
  const raw = String(text || '').trim()
  if (!raw) throw new Error('EMPTY_LLM_OUTPUT')
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1].trim() : raw
  try {
    return JSON.parse(body)
  } catch (e) {
    const start = body.search(/[[{]/)
    const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'))
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1))
      } catch (e2) {
        /* 落到下面统一报错 */
      }
    }
    throw new Error(`BAD_JSON: ${String(e.message || e).slice(0, 120)}`)
  }
}

function resolveRuntime() {
  const c = config.wechatArchive
  return {
    apiUrl: c.apiUrl,
    apiKey: c.apiKey,
    model: c.model,
    timeoutMs: c.timeoutMs,
    enableThinking: c.enableThinking,
  }
}

function archiveStatus() {
  const c = config.wechatArchive
  return {
    ready: Boolean(c.apiKey),
    model: c.model,
    apiKeySource: c.apiKeySource || null,
    tokenRequired: config.nodeEnv === 'production' && !c.token,
    maxChars: c.maxChars,
  }
}

async function callLlm(messages, options = {}) {
  const rt = resolveRuntime()
  if (!rt.apiKey) {
    const err = new Error('未配置大模型密钥（WECHAT_ARCHIVE_API_KEY / GEO_LLM_API_KEY / DASHSCOPE_API_KEY）')
    err.code = 'LLM_NOT_CONFIGURED'
    throw err
  }
  try {
    const { text, usage } = await chatCompletion({
      apiUrl: rt.apiUrl,
      apiKey: rt.apiKey,
      model: rt.model,
      messages,
      temperature: options.temperature ?? 0.2,
      responseFormat: { type: 'json_object' },
      enableThinking: rt.enableThinking,
      timeoutMs: rt.timeoutMs,
    })
    return { text, usage }
  } catch (e) {
    if (e && e.code === 'LLM_TIMEOUT') throw e
    // 上游的原话（「Incorrect API key provided」、内网地址、账单提示）只进日志。
    // 公开接口上原样抛出去，等于告诉外人我们用的哪家、密钥配没配对。
    console.error('[wechat-archive] 大模型调用失败：', e && e.message ? e.message : e)
    const err = new Error('模型服务暂时不可用')
    err.code = 'LLM_FAILED'
    err.cause = e
    throw err
  }
}

// ---------------------------------------------------------------------------
// 归一化 & 风控
// ---------------------------------------------------------------------------

function normalizeFacts(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const f = src.facts && typeof src.facts === 'object' ? src.facts : {}
  const roles = {}
  if (src.roles && typeof src.roles === 'object') {
    Object.entries(src.roles).forEach(([k, v]) => {
      const role = ['技师', '车主', '其他'].includes(v) ? v : '其他'
      roles[clipText(k, 20)] = role
    })
  }
  const photoHints = Array.isArray(f.photoHints)
    ? f.photoHints.slice(0, 10).map((p) => ({
        node: clipText(p?.node, 20),
        count: Math.max(0, Math.min(20, Number(p?.count) || 0)),
        say: clipText(p?.say, 100),
      }))
    : []
  return {
    roles,
    facts: {
      vehicle: clipText(f.vehicle, 40),
      odo: clipText(f.odo, 30),
      symptom: clipText(f.symptom, 200),
      checkFindings: toArray(f.checkFindings),
      excluded: toArray(f.excluded),
      plan: clipText(f.plan, 300),
      planReason: clipText(f.planReason, 300),
      process: toArray(f.process, 12, 120),
      parts: toArray(f.parts),
      finish: clipText(f.finish, 300),
      duration: clipText(f.duration, 40),
      handover: clipText(f.handover, 300),
      amount: clipText(f.amount, 40),
      photoHints,
    },
    timeline: Array.isArray(src.timeline)
      ? src.timeline.slice(0, 8).map((t) => ({
          at: clipText(t?.at, 30),
          who: clipText(t?.who, 20),
          what: clipText(t?.what, 200),
        }))
      : [],
    doubts: Array.isArray(src.doubts)
      ? src.doubts.slice(0, 12).map((d) => ({
          field: clipText(d?.field, 30),
          value: clipText(d?.value, 200),
          why: clipText(d?.why, 200),
        }))
      : [],
    missing: toArray(src.missing, 20, 60),
    confidence: Math.max(0, Math.min(1, Number(src.confidence) || 0)),
    note: clipText(src.note, 200),
  }
}

function normalizeCase(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const sections = Array.isArray(src.sections)
    ? src.sections
        .slice(0, 12)
        .map((s) => ({ name: clipText(s?.name, 20), text: clipText(s?.text, 2000) }))
        .filter((s) => s.name && s.text)
    : []
  // 九段少一段就补一段降级话术，页面上让人自己改——不许静默丢段
  const named = new Set(sections.map((s) => s.name))
  SECTION_NAMES.forEach((name) => {
    if (!named.has(name)) sections.push({ name, text: '' })
  })
  sections.sort((a, b) => SECTION_NAMES.indexOf(a.name) - SECTION_NAMES.indexOf(b.name))

  return {
    title: clipText(src.title, 80),
    summary: clipText(src.summary, 600),
    sections,
    captions: Array.isArray(src.captions)
      ? src.captions
          .slice(0, 12)
          .map((c) => ({ node: clipText(c?.node, 20), text: clipText(c?.text, 120) }))
          .filter((c) => c.text)
      : [],
    faq: Array.isArray(src.faq)
      ? src.faq
          .slice(0, 5)
          .map((item) => ({ q: clipText(item?.q, 80), a: clipText(item?.a, 400) }))
          .filter((item) => item.q && item.a)
      : [],
    aiAbstract: clipText(src.aiAbstract, 800),
    sourceLabel: clipText(src.sourceLabel, 40) || '门店发布 · 已脱敏 · 已审核',
  }
}

/**
 * 生成完了再扫一遍。模型嘴上说不要写金额，手上还是会写。
 * 这里只报告不自动改——改文案是人的决定，工具不能偷偷动（07 §17 人工编辑规则）。
 */
function riskScan(caseData) {
  const found = []
  const check = (field, text) => {
    const value = String(text || '')
    if (!value) return
    for (const rule of RISK_RULES) {
      const hit = value.match(rule.re)
      if (hit) {
        found.push({ field, type: rule.type, sample: hit[0] })
        break
      }
    }
  }
  check('title', caseData?.title)
  check('summary', caseData?.summary)
  check('aiAbstract', caseData?.aiAbstract)
  ;(caseData?.sections || []).forEach((s) => check(`正文·${s.name}`, s.text))
  ;(caseData?.captions || []).forEach((c) => check(`图说·${c.node || '未命名'}`, c.text))
  ;(caseData?.faq || []).forEach((item, i) => {
    check(`FAQ${i + 1}·问`, item.q)
    check(`FAQ${i + 1}·答`, item.a)
  })
  return found
}

// ---------------------------------------------------------------------------
// 对外：两个动作
// ---------------------------------------------------------------------------

/**
 * 群聊 → 事实。
 * @param {{text?:string, messages?:Array, category?:string}} input
 * @param {{llm?:Function}} options 注入 llm 便于测试（本地没 key 也能跑流水线）
 */
async function extractFacts(input, options = {}) {
  const category = CATEGORY_ITEMS[input?.category] ? input.category : 'chassis_noise'
  let text = String(input?.text || '').trim()
  if (!text && Array.isArray(input?.messages) && input.messages.length) {
    text = renderMessages(input.messages)
  }
  if (!text) {
    const err = new Error('群聊内容是空的')
    err.code = 'EMPTY_INPUT'
    throw err
  }
  const maxChars = config.wechatArchive.maxChars
  if (text.length > maxChars) {
    const err = new Error(`群聊太长（${text.length} 字），上限 ${maxChars} 字。请只复制这一单相关的段落。`)
    err.code = 'TOO_LONG'
    throw err
  }

  // 兜底脱敏：页面已经脱过一遍，这里是第二道闸——人工改过的内容可能把隐私改回来
  const masked = maskChatText(text)
  const parsed = parseChat(masked.text)

  const prompt = extractUserPrompt({
    text: masked.text,
    stats: parsed.stats,
    senders: [...new Set(parsed.messages.map((m) => m.sender).filter(Boolean))],
    category,
  })
  const llm = options.llm || callLlm
  const { text: raw, usage } = await llm(
    [
      { role: 'system', content: extractSystemPrompt() },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.2 },
  )

  const data = normalizeFacts(parseJsonLoose(raw))
  return {
    ...data,
    category,
    categoryLabel: CATEGORY_LABELS[category] || category,
    maskedText: masked.text,
    maskHits: masked.hits,
    senderMapping: masked.senderMapping,
    stats: parsed.stats,
    usage: usage || null,
  }
}

/**
 * 事实 → 案例。
 * @param {{facts:Object, timeline?:Array, city?:string, district?:string, category?:string}} input
 */
async function composeCase(input, options = {}) {
  const facts = input?.facts && typeof input.facts === 'object' ? input.facts : {}
  const hasAny = Object.values(facts).some((v) =>
    Array.isArray(v) ? v.length > 0 : String(v || '').trim().length > 0,
  )
  if (!hasAny) {
    const err = new Error('还没有可确认的事实，先在左边过一遍')
    err.code = 'EMPTY_FACTS'
    throw err
  }
  const llm = options.llm || callLlm
  const { text: raw, usage } = await llm(
    [
      { role: 'system', content: composeSystemPrompt() },
      {
        role: 'user',
        content: composeUserPrompt({
          facts,
          city: input.city,
          district: input.district,
          category: input.category,
        }),
      },
    ],
    { temperature: 0.4 },
  )

  const data = normalizeCase(parseJsonLoose(raw))
  return { ...data, risk: riskScan(data), usage: usage || null }
}

module.exports = {
  parseChat,
  renderMessages,
  maskChatText,
  ensureMasked,
  extractFacts,
  composeCase,
  riskScan,
  archiveStatus,
  normalizeFacts,
  normalizeCase,
  parseJsonLoose,
  CATEGORY_ITEMS,
  CATEGORY_LABELS,
  SECTION_NAMES,
  MASK_RULES,
}
