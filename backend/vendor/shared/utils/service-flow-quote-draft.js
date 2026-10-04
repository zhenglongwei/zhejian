/**
 * 方案草稿：封闭类目按套餐，开口活为可见项 + 拆检。
 * 真源：docs/04_维修过程相册/26_ §4.2.1
 */
const {
  FINDING_RESULT,
  QUOTE_CONFIRM_COPY,
  QUOTE_CONFIRM_COPY_TEARDOWN,
} = require('../constants/service-flow-nodes')
const { resolveFlowCategory } = require('./service-flow-placeholders')

const OPEN_CATEGORIES = new Set(['accident', 'chassis_noise', 'default', 'generic'])

const SKIP_PART = [
  /里程/,
  /仪表/,
  /^环车/,
  /灯光/,
  /故障码/,
  /指示灯/,
  /胎压实测/,
  /底盘目视/,
  /到店诉求/,
  /下次保养/,
  /定损/,
  /读码/,
  /单据/,
]

const MAINT_EXTRAS = [
  { jobKey: 'cabin_filter', name: '更换空调滤芯', aliases: [/空调滤/, /空调格/] },
  { jobKey: 'air_filter', name: '更换空气滤芯', aliases: [/空滤/, /空气滤/] },
  { jobKey: 'wiper', name: '更换雨刮器', aliases: [/雨刮/, /刮片/] },
  { jobKey: 'brake_fluid', name: '更换刹车油', aliases: [/刹车油/, /制动液/] },
  { jobKey: 'coolant', name: '更换防冻液', aliases: [/防冻液/, /冷却液/] },
  { jobKey: 'spark_plugs', name: '更换火花塞', aliases: [/火花塞/] },
  { jobKey: 'fuel_filter', name: '更换燃油滤芯', aliases: [/燃油滤/, /汽滤/, /汽油滤/] },
]

function emptyLine(name, note = '') {
  return {
    name: String(name || '').trim(),
    brand: '',
    amount: '',
    note: String(note || '').trim(),
    evidenceUrl: '',
    evidenceUrls: [],
  }
}

function partText(item = {}) {
  return String(item.partName || item.name || '').trim()
}

function isAction(item = {}) {
  return item.result === FINDING_RESULT.ACTION
}

function skipPart(name) {
  const text = String(name || '').trim()
  if (!text) return true
  return SKIP_PART.some((re) => re.test(text))
}

function actionItems(findings = []) {
  return (findings || []).filter((row) => isAction(row) && !skipPart(partText(row)))
}

function matchAlias(name, aliases) {
  return aliases.some((re) => re.test(name))
}

function uniqueJobs(rows) {
  const seen = {}
  const out = []
  rows.forEach((row) => {
    const key = row.jobKey || row.name
    if (!key || seen[key]) return
    seen[key] = true
    out.push(emptyLine(row.name, row.note))
  })
  return out
}

function joinAdvice(items) {
  return items
    .map((row) => String(row.advice || '').trim())
    .filter(Boolean)
    .filter((text, i, list) => list.indexOf(text) === i)
    .join('；')
}

function maintenanceDraft(findings, includeMajor) {
  const lines = [emptyLine('更换机油机滤', '机油与机滤一并更换')]
  const extras = includeMajor ? MAINT_EXTRAS : MAINT_EXTRAS.filter((row) => row.jobKey !== 'spark_plugs')
  extras.forEach((extra) => {
    const hits = actionItems(findings).filter((row) => matchAlias(partText(row), extra.aliases))
    if (hits.length) lines.push(emptyLine(extra.name, joinAdvice(hits)))
  })
  return lines
}

function batteryDraft() {
  return [emptyLine('更换电瓶', '')]
}

function brakeDraft(findings) {
  const items = actionItems(findings)
  const jobs = []
  const take = (jobKey, name, aliases) => {
    const hits = items.filter((row) => matchAlias(partText(row), aliases))
    if (hits.length) jobs.push({ jobKey, name, note: joinAdvice(hits) })
  }
  take('front_pads', '更换前刹车片', [/前.{0,4}(刹车片|制动片|摩擦片)/, /左前片/, /右前片/])
  take('rear_pads', '更换后刹车片', [/后.{0,4}(刹车片|制动片|摩擦片)/, /左后片/, /右后片/])
  if (!jobs.some((row) => row.jobKey === 'front_pads' || row.jobKey === 'rear_pads')) {
    take('pads', '更换刹车片', [/刹车片/, /制动片/, /片厚/])
  }
  take('front_rotors', '更换前刹车盘', [/前.{0,4}(刹车盘|制动盘)/])
  take('rear_rotors', '更换后刹车盘', [/后.{0,4}(刹车盘|制动盘)/])
  if (!jobs.some((row) => row.jobKey === 'front_rotors' || row.jobKey === 'rear_rotors')) {
    take('rotors', '更换刹车盘', [/刹车盘/, /制动盘/, /盘面/, /盘厚/])
  }
  take('brake_fluid', '更换刹车油', [/刹车油/, /制动液/])
  return uniqueJobs(jobs)
}

function tireDraft(findings) {
  return actionItems(findings)
    .filter((row) => /胎|轮胎|轮圈/.test(partText(row)))
    .map((row) => {
      const part = partText(row)
      const name = /轮胎|胎/.test(part) ? `更换${part.replace(/^更换/, '')}` : '更换轮胎'
      const note = [joinAdvice([row]), '含动平衡'].filter(Boolean).join('，')
      return emptyLine(name, note)
    })
}

function acDraft(findings) {
  const items = actionItems(findings)
  const jobs = []
  const take = (jobKey, name, aliases) => {
    const hits = items.filter((row) => matchAlias(partText(row), aliases))
    if (hits.length) jobs.push({ jobKey, name, note: joinAdvice(hits) })
  }
  take('cabin_filter', '更换空调滤芯', [/空调滤/, /空调格/])
  take('refrigerant', '检漏补冷媒', [/冷媒/, /氟/, /压力/, /检漏/])
  take('condenser', '处理冷凝器', [/冷凝器/])
  return uniqueJobs(jobs)
}

function paintJobName(part, advice) {
  if (/凹陷|钣金|变形|碰撞/.test(advice) || /凹陷|碰撞/.test(part)) return `${part}钣金喷漆`
  if (/更换|破损|开裂|脱落|破碎/.test(advice)) return `${part}更换并喷漆`
  return `${part}补漆`
}

function bodyPaintDraft(findings) {
  return actionItems(findings).map((row) => {
    const part = partText(row)
    return emptyLine(paintJobName(part, String(row.advice || '')), '')
  })
}

function visibleJobName(part, advice) {
  const text = `${part} ${advice}`
  if (/滤芯|机油|雨刮|电瓶/.test(part)) return `更换${part.replace(/^更换/, '')}`
  if (/更换/.test(advice) && !/碰撞|凹陷|划痕|漆/.test(text)) {
    return `更换${part.replace(/^更换/, '')}`
  }
  if (/喷漆|补漆|钣金|碰撞|凹陷|划痕|漆面|翼子|保险杠|侧裙|底大边/.test(text)) {
    return paintJobName(part, advice)
  }
  if (/清洗/.test(advice)) return `清洗${part}`
  return `${part}维修`
}

function isTeardownPart(name) {
  return !/滤芯|机油|雨刮|空调格/.test(String(name || ''))
}

function openDraft(findings) {
  const items = actionItems(findings)
  const teardownParts = items
    .map((row) => partText(row))
    .filter((name) => name && isTeardownPart(name))
  const teardownNote = teardownParts.length
    ? `拆开查看：${teardownParts.join('、')}`
    : '按损伤部位拆开查看'
  const lines = [emptyLine('拆检', teardownNote)]
  items.forEach((row) => {
    const part = partText(row)
    lines.push(emptyLine(visibleJobName(part, String(row.advice || '')), ''))
  })
  return lines
}

function isOpenCategory(category) {
  return OPEN_CATEGORIES.has(category)
}

function buildQuoteDraft({ findings = [], templateId = '', serviceName = '' } = {}) {
  if (!String(templateId || '').trim() && !String(serviceName || '').trim()) {
    return {
      category: '',
      mode: 'package',
      lines: [],
      merchantHint: '',
      confirmCopy: QUOTE_CONFIRM_COPY,
    }
  }
  const category = resolveFlowCategory(templateId, serviceName)
  const open = isOpenCategory(category)
  let lines = []
  if (category === 'maintenance') lines = maintenanceDraft(findings, false)
  else if (category === 'major_maintenance') lines = maintenanceDraft(findings, true)
  else if (category === 'battery') lines = batteryDraft()
  else if (category === 'brake') lines = brakeDraft(findings)
  else if (category === 'tire') lines = tireDraft(findings)
  else if (category === 'ac') lines = acDraft(findings)
  else if (category === 'body_paint') lines = bodyPaintDraft(findings)
  else if (open) lines = openDraft(findings)
  else lines = []

  return {
    category,
    mode: open ? 'teardown' : 'package',
    lines,
    merchantHint: open ? '拆开后如有增减，再通知车主' : '',
    confirmCopy: open ? QUOTE_CONFIRM_COPY_TEARDOWN : QUOTE_CONFIRM_COPY,
  }
}

function buildQuoteLinesFromFindings(findings = [], opts = {}) {
  return buildQuoteDraft({
    findings,
    templateId: opts.templateId,
    serviceName: opts.serviceName,
  }).lines
}

function resolveQuoteConfirmCopy(opts = {}) {
  return buildQuoteDraft(opts).confirmCopy
}

module.exports = {
  buildQuoteDraft,
  buildQuoteLinesFromFindings,
  resolveQuoteConfirmCopy,
  isOpenCategory,
}
