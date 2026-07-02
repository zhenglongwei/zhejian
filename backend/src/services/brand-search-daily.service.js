/**
 * GEO-IGAIN-E02 · 品牌词/Direct 日聚合（平台级 · event_tracking_log → brand_search_daily）
 */
const { prisma } = require('../lib/prisma')
const {
  isBrandAttributedRow,
  BRAND_PATTERN,
  parseEventParams,
} = require('../lib/brand-search-utils')

const PAGE_VIEW_EVENTS = [
  'h5_case_view',
  'h5_store_view',
  'h5_service_view',
  'h5_page_view',
  'h5_geo_topic_view',
  'h5_city_view',
]

function formatStatDate(date) {
  const d = date instanceof Date ? date : new Date(date)
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

function buildRowId(statDate) {
  return `bsd_${statDate.toISOString().slice(0, 10)}`
}

function resolveDayRange(dateInput) {
  const base = dateInput ? new Date(dateInput) : new Date()
  const statDate = formatStatDate(base)
  const start = new Date(statDate)
  const end = new Date(statDate)
  end.setUTCDate(end.getUTCDate() + 1)
  return { statDate, start, end }
}

function aggregateRowMetrics(rows) {
  let brandAttributedViews = 0
  let directViews = 0
  let brandSourceViews = 0
  let brandSearchSubmitViews = 0

  rows.forEach((row) => {
    if (!isBrandAttributedRow(row)) return
    brandAttributedViews += 1
    if (String(row.channel || '').toLowerCase() === 'direct') directViews += 1
    if (BRAND_PATTERN.test(String(row.source || ''))) brandSourceViews += 1
    const params = parseEventParams(row.eventParams)
    const keyword = String(params.keyword || params.q || '').trim()
    if (keyword && BRAND_PATTERN.test(keyword)) brandSearchSubmitViews += 1
  })

  return {
    brandAttributedViews,
    directViews,
    brandSourceViews,
    brandSearchSubmitViews,
  }
}

/**
 * @param {{ date?: string|Date }} [options]
 */
async function aggregateBrandSearchDaily(options = {}) {
  const { statDate, start, end } = resolveDayRange(options.date)
  const rows = await prisma.eventTrackingLog.findMany({
    where: {
      eventName: { in: PAGE_VIEW_EVENTS },
      createdAt: { gte: start, lt: end },
    },
    select: {
      channel: true,
      source: true,
      referrer: true,
      eventParams: true,
    },
  })

  const metrics = aggregateRowMetrics(rows)
  const id = buildRowId(statDate)
  await prisma.brandSearchDaily.upsert({
    where: { statDate },
    create: { id, statDate, ...metrics },
    update: metrics,
  })

  return {
    statDate: statDate.toISOString().slice(0, 10),
    eventRows: rows.length,
    ...metrics,
  }
}

/**
 * @param {{ from: Date|string, to: Date|string }} range
 */
async function queryBrandSearchDailyRange(range) {
  const from = formatStatDate(range.from)
  const to = formatStatDate(range.to)
  return prisma.brandSearchDaily.findMany({
    where: { statDate: { gte: from, lte: to } },
    orderBy: { statDate: 'asc' },
  })
}

module.exports = {
  aggregateBrandSearchDaily,
  queryBrandSearchDailyRange,
  aggregateRowMetrics,
  buildRowId,
}
