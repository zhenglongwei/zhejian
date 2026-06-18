/**
 * GEO-CITE-C03 · LLM 输出合规禁词（营销/承诺类）
 */
const GEO_LLM_BANNED_PHRASES = [
  '好评返现',
  '晒图返现',
  '分享赚钱',
  '转发领钱',
  '全网最低',
  '100%修好',
  '保证一次修好',
  '永久不复发',
  '全城最便宜',
  '必须马上维修',
  '全网最好',
  '绝对靠谱',
  '包修好',
]

function findGeoLlmViolation(text) {
  const raw = String(text || '')
  return GEO_LLM_BANNED_PHRASES.find((phrase) => raw.includes(phrase)) || ''
}

function sanitizeGeoLlmText(text) {
  let value = String(text || '').trim()
  for (const phrase of GEO_LLM_BANNED_PHRASES) {
    value = value.split(phrase).join('')
  }
  return value.trim()
}

module.exports = {
  GEO_LLM_BANNED_PHRASES,
  findGeoLlmViolation,
  sanitizeGeoLlmText,
}
