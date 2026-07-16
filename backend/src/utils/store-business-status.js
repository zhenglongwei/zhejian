/**
 * 门店营业态：按营业时间 + 临时休息 + 门店运营态计算
 * 对外：open | closed | holiday | suspended | offline
 */

const { parseBusinessHours, normalizeTime } = require('../../../utils/business-hours')
const { formatShanghaiDate } = require('../lib/shanghai-date')
const { STORE_STATUS } = require('../constants/merchant')

function shanghaiNowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type) => parts.find((p) => p.type === type)?.value || ''
  const hour = get('hour') === '24' ? '00' : get('hour')
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    timeStr: `${hour}:${get('minute')}`,
  }
}

function isWithinTemporaryClosure(closures, dateStr) {
  return (closures || []).some((item) => {
    const start = String(item.startDate || '')
    const end = String(item.endDate || '')
    if (!start || !end) return false
    return dateStr >= start && dateStr <= end
  })
}

function closureLooksHoliday(closures, dateStr) {
  const hit = (closures || []).find((item) => {
    const start = String(item.startDate || '')
    const end = String(item.endDate || '')
    return start && end && dateStr >= start && dateStr <= end
  })
  if (!hit) return false
  const note = String(hit.note || '')
  return /节假|假期|春节|国庆|元旦|清明|端午|中秋/.test(note)
}

/**
 * @param {{ storeStatus?: string, businessHours?: string, bookingPaused?: boolean, now?: Date }} input
 */
function resolveStoreBusinessStatus(input = {}) {
  const storeStatus = String(input.storeStatus || '').trim()
  if (storeStatus === STORE_STATUS.OFFLINE || storeStatus === STORE_STATUS.DRAFT) {
    return 'offline'
  }
  if (storeStatus === STORE_STATUS.PENDING_AUDIT) {
    return 'offline'
  }
  if (input.bookingPaused === true) {
    return 'suspended'
  }
  if (storeStatus && storeStatus !== STORE_STATUS.ACTIVE) {
    return 'offline'
  }

  const { dateStr, timeStr } = shanghaiNowParts(input.now || new Date())
  const parsed = parseBusinessHours(input.businessHours || '')
  if (isWithinTemporaryClosure(parsed.temporaryClosures, dateStr)) {
    return closureLooksHoliday(parsed.temporaryClosures, dateStr) ? 'holiday' : 'closed'
  }

  const start = normalizeTime(parsed.daily && parsed.daily.start)
  const end = normalizeTime(parsed.daily && parsed.daily.end)
  if (timeStr >= start && timeStr < end) {
    return 'open'
  }
  return 'closed'
}

function buildFreshnessSummary(freshness = {}) {
  const parts = []
  if (freshness.lastPublicCaseAt) {
    parts.push(`最近公开案例：${freshness.lastPublicCaseAt}`)
  }
  if (freshness.lastProfileVerifiedAt) {
    parts.push(`资料最近核实：${freshness.lastProfileVerifiedAt}`)
  }
  return parts.join(' · ')
}

module.exports = {
  resolveStoreBusinessStatus,
  buildFreshnessSummary,
  shanghaiNowParts,
  formatShanghaiDate,
}
