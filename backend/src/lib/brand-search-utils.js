/**
 * GEO-IGAIN-E · 品牌词归因工具（event_tracking_log）
 */
const BRAND_PATTERN = /辙见|zhejian|geo\.simplewin/i

function parseEventParams(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw
}

function isBrandAttributedRow(row) {
  const channel = String(row.channel || '').trim().toLowerCase()
  const source = String(row.source || '').trim()
  const referrer = String(row.referrer || '').trim()
  if (channel === 'direct') return true
  if (BRAND_PATTERN.test(source)) return true
  if (BRAND_PATTERN.test(referrer)) return true
  const params = parseEventParams(row.eventParams)
  const keyword = String(params.keyword || params.q || params.searchTerm || '').trim()
  if (keyword && BRAND_PATTERN.test(keyword)) return true
  return false
}

module.exports = {
  BRAND_PATTERN,
  parseEventParams,
  isBrandAttributedRow,
}
