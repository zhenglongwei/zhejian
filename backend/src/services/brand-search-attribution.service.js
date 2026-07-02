/**
 * GEO-IGAIN-E · 品牌词 / Direct 隐形归因（基于 event_tracking_log）
 */
const { prisma } = require('../lib/prisma')

const BRAND_PATTERN = /辙见|zhejian|geo\.simplewin/i
const PAGE_VIEW_EVENTS = new Set([
  'h5_case_view',
  'h5_store_view',
  'h5_service_view',
  'h5_page_view',
  'h5_geo_topic_view',
  'h5_city_view',
])

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

function median(values) {
  const list = (values || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (!list.length) return 0
  const mid = Math.floor(list.length / 2)
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2
}

/**
 * @param {{ days?: number }} [query]
 */
async function computeBrandSearchAttribution(query = {}) {
  const days = Math.min(Math.max(Number(query.days) || 7, 1), 90)
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)
  since.setUTCHours(0, 0, 0, 0)

  const baselineSince = new Date(since)
  baselineSince.setUTCDate(baselineSince.getUTCDate() - 28)

  const rows = await prisma.eventTrackingLog.findMany({
    where: {
      eventName: { in: [...PAGE_VIEW_EVENTS] },
      createdAt: { gte: baselineSince },
    },
    select: {
      eventName: true,
      channel: true,
      source: true,
      referrer: true,
      eventParams: true,
      createdAt: true,
    },
  })

  const current = []
  const baselineWeeks = [0, 0, 0, 0]
  rows.forEach((row) => {
    const isBrand = isBrandAttributedRow(row)
    if (!isBrand) return
    const ts = new Date(row.createdAt).getTime()
    if (ts >= since.getTime()) {
      current.push(row)
      return
    }
    const dayDiff = Math.floor((since.getTime() - ts) / (24 * 60 * 60 * 1000))
    const weekIndex = Math.min(3, Math.floor(dayDiff / 7))
    baselineWeeks[weekIndex] += 1
  })

  const currentCount = current.length
  const baselineMedian = median(baselineWeeks)
  const scaledBaseline = baselineMedian * (days / 7)
  const uplift =
    scaledBaseline > 0 ? (currentCount - scaledBaseline) / scaledBaseline : currentCount > 0 ? 1 : 0

  const directCount = current.filter((row) => String(row.channel || '').toLowerCase() === 'direct').length
  const brandSourceCount = current.filter((row) => BRAND_PATTERN.test(String(row.source || ''))).length
  const brandSearchCount = current.filter((row) => {
    const params = parseEventParams(row.eventParams)
    const keyword = String(params.keyword || params.q || '').trim()
    return keyword && BRAND_PATTERN.test(keyword)
  }).length

  return {
    period_days: days,
    brand_attributed_views: currentCount,
    direct_views: directCount,
    brand_source_views: brandSourceCount,
    brand_search_submit_views: brandSearchCount,
    baseline_weekly_median: baselineMedian,
    brand_search_uplift: uplift,
    sample_note: currentCount < 10 ? '品牌归因样本较少，仅供参考' : '',
  }
}

module.exports = {
  computeBrandSearchAttribution,
  isBrandAttributedRow,
  BRAND_PATTERN,
}
