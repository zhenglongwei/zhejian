/**
 * GEO-TOPIC-H05 · 咨询线索 → OBS prompt 候选脱敏规则
 */
const BANNED_PHRASES = [
  '好评返现',
  '晒图返现',
  '分享赚钱',
  '全网最低',
  '100%修好',
  '保证一次修好',
  '加我微信',
  '私聊我',
  '转账',
]

const PII_PATTERNS = [
  { name: 'mobile', regex: /1[3-9]\d{9}/g },
  { name: 'plate', regex: /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-HJ-NP-Z0-9]{4,6}/g },
  { name: 'vin', regex: /\b[A-HJ-NPR-Z0-9]{17}\b/gi },
  { name: 'email', regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { name: 'id_card', regex: /\b\d{17}[\dXx]\b/g },
]

const A_CLASS_ONLY_PATTERNS = [
  /^哪里(可以|能)?修/,
  /哪家店/,
  /附近.*(修车|维修|保养)/,
  /推荐.*门店/,
]

function detectPiiTypes(text) {
  const raw = String(text || '')
  return PII_PATTERNS.filter((item) => item.regex.test(raw)).map((item) => item.name)
}

function stripPii(text) {
  let value = String(text || '')
  PII_PATTERNS.forEach((item) => {
    value = value.replace(item.regex, '[已脱敏]')
  })
  return value.replace(/\s+/g, ' ').trim()
}

function findBannedPhrase(text) {
  const raw = String(text || '')
  return BANNED_PHRASES.find((phrase) => raw.includes(phrase)) || ''
}

function normalizeFaultSnippet(text) {
  return String(text || '')
    .replace(/[。！？!?,.，；;：:]+$/g, '')
    .replace(/\s+/g, '')
    .slice(0, 24)
}

/**
 * @param {object} input
 * @returns {{ ok: boolean, reason?: string, prompt?: string, fault?: string, promptType?: string, piiTypes?: string[] }}
 */
function buildLeadPromptCandidate(input = {}) {
  const serviceName = String(input.serviceName || '').trim()
  const city = String(input.city || '').trim()
  const description = String(input.description || '').trim()
  const vehicle = input.vehicle && typeof input.vehicle === 'object' ? input.vehicle : {}

  if (!serviceName || !description) {
    return { ok: false, reason: '缺少服务名或咨询描述' }
  }

  const rawPii = detectPiiTypes(description)
  if (rawPii.length) {
    return { ok: false, reason: '含隐私信息，不可入库', piiTypes: rawPii }
  }

  const sanitized = stripPii(description)
  const banned = findBannedPhrase(sanitized)
  if (banned) {
    return { ok: false, reason: `含违规表述：${banned}`, piiTypes: rawPii }
  }

  const fault = normalizeFaultSnippet(sanitized)
  if (fault.length < 4) {
    return { ok: false, reason: '故障描述过短', piiTypes: rawPii }
  }

  const aClassOnly = A_CLASS_ONLY_PATTERNS.some((pattern) => pattern.test(sanitized))
  if (aClassOnly && fault.length < 8) {
    return { ok: false, reason: 'A 类找店词且无足够故障信息，不纳入候选', piiTypes: rawPii }
  }

  const vehicleSeries = String(vehicle.series || vehicle.model || vehicle.vehicleSeries || '').trim()
  const promptType = vehicleSeries ? 'C' : 'B'
  const prompt = vehicleSeries
    ? `${vehicleSeries}${serviceName}，${fault}怎么处理？`
    : city
      ? `${city}${serviceName}，${fault}怎么办？`
      : `${serviceName}，${fault}怎么处理？`

  return {
    ok: true,
    prompt: prompt.slice(0, 120),
    fault,
    promptType,
    piiTypes: rawPii,
  }
}

function parseCityFromAddress(address) {
  const raw = String(address || '').trim()
  if (!raw) return ''
  const match = raw.match(
    /(北京|上海|天津|重庆|杭州|宁波|温州|南京|苏州|无锡|广州|深圳|东莞|佛山|成都|武汉|西安|长沙|郑州|青岛|济南|合肥|福州|厦门|昆明|大连|沈阳|哈尔滨|长春|石家庄|太原|南昌|南宁|贵阳|兰州|海口|乌鲁木齐|呼和浩特)/
  )
  return match ? match[1] : ''
}

module.exports = {
  BANNED_PHRASES,
  detectPiiTypes,
  stripPii,
  buildLeadPromptCandidate,
  parseCityFromAddress,
  normalizeFaultSnippet,
}
