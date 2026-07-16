const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const {
  shanghaiDayBounds,
  yesterdayShanghai,
  resolvePeriodRange,
  listDateStrings,
  addDays,
  formatShanghaiDate,
  statDateValue,
} = require('../lib/shanghai-date')
const {
  LEAD_STATUS,
  isServiceAlbumRepairDone,
  PUBLIC_CASE_STATUS,
} = require('../constants/v2')
const { fetchStatsInsights } = require('./merchant-stats-insights.service')
const { loadStoreCapabilityById } = require('../utils/store-capability-load')

const ACTIVE_MERCHANT_STATUS = 'ACTIVE'
const CORE_NODE_DONE_MIN = 4

const MERCHANT_METRIC_NOTES = {
  userExposure: '公开网页案例页、小程序内浏览与电话点击来自真实用户行为。',
  crawlerProxy:
    '「搜索/智能助手爬虫访问」指已知机器人抓取本店公开页次数，不代表智能助手在对话中引用本店，也不代表收录或排名。',
  probeInternal:
    '平台「答案探测」为内部抽样监测，不向商家展示引用次数；请勿将爬虫访问理解为被智能助手引用。',
}

const STORE_VIEW_EVENTS = new Set(['store_view', 'h5_store_view'])
const SERVICE_VIEW_EVENTS = new Set(['service_view', 'h5_service_view'])
const H5_CASE_VIEW_EVENT = 'h5_case_view'
const MP_CASE_VIEW_EVENT = 'case_view'
const CASE_VIEW_EVENTS = new Set([MP_CASE_VIEW_EVENT, H5_CASE_VIEW_EVENT])
const PHONE_EVENTS = new Set(['phone_click', 'h5_call_click'])
const GEO_EVENTS = new Set(['geo_page_view'])
const CRAWLER_VIEW_EVENTS = new Set(['h5_crawler_view'])
const TRACKED_AGG_EVENTS = [
  ...STORE_VIEW_EVENTS,
  ...SERVICE_VIEW_EVENTS,
  ...CASE_VIEW_EVENTS,
  ...PHONE_EVENTS,
  ...GEO_EVENTS,
  ...CRAWLER_VIEW_EVENTS,
  'h5_page_view',
]

function paramStoreId(params) {
  if (!params || typeof params !== 'object') return ''
  return String(params.storeId || params.store_id || '').trim()
}

function isAlbumCoreComplete(nodes) {
  const done = (nodes || []).filter((n) => n.status === 'done').length
  return done >= CORE_NODE_DONE_MIN
}

async function countEventMetrics(storeId, start, end) {
  const logs = await prisma.eventTrackingLog.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      eventName: { in: [...TRACKED_AGG_EVENTS] },
    },
    select: { eventName: true, eventParams: true },
  })

  const metrics = {
    storeViewCount: 0,
    serviceViewCount: 0,
    caseViewCount: 0,
    h5CaseViewCount: 0,
    mpCaseViewCount: 0,
    geoViewCount: 0,
    crawlerViewCount: 0,
    phoneClickCount: 0,
  }

  for (const row of logs) {
    if (paramStoreId(row.eventParams) !== storeId) continue
    const name = row.eventName
    const params = row.eventParams || {}

    if (STORE_VIEW_EVENTS.has(name)) metrics.storeViewCount += 1
    if (SERVICE_VIEW_EVENTS.has(name)) metrics.serviceViewCount += 1
    if (name === H5_CASE_VIEW_EVENT) {
      metrics.h5CaseViewCount += 1
      metrics.caseViewCount += 1
    }
    if (name === MP_CASE_VIEW_EVENT) {
      metrics.mpCaseViewCount += 1
      metrics.caseViewCount += 1
    }
    if (PHONE_EVENTS.has(name)) metrics.phoneClickCount += 1
    if (GEO_EVENTS.has(name)) metrics.geoViewCount += 1
    if (CRAWLER_VIEW_EVENTS.has(name)) metrics.crawlerViewCount += 1
    if (
      name === 'h5_page_view' &&
      (params.pageType === 'geo' || String(params.page_path || '').includes('/geo'))
    ) {
      metrics.geoViewCount += 1
    }
  }

  return metrics
}

async function countLeadMetrics(storeId, start, end) {
  const [leadSubmitCount, caseConsultCount, leadContactedCount, leadClosedCount] =
    await Promise.all([
      prisma.consultLead.count({
        where: { storeId, createdAt: { gte: start, lte: end } },
      }),
      prisma.consultLead.count({
        where: {
          storeId,
          createdAt: { gte: start, lte: end },
          caseId: { not: '' },
        },
      }),
      prisma.leadStatusLog.count({
        where: {
          createdAt: { gte: start, lte: end },
          toStatus: LEAD_STATUS.CONTACTED,
          lead: { storeId },
        },
      }),
      prisma.leadStatusLog.count({
        where: {
          createdAt: { gte: start, lte: end },
          toStatus: { in: [LEAD_STATUS.CLOSED, LEAD_STATUS.CANCELLED] },
          lead: { storeId },
        },
      }),
    ])

  return { leadSubmitCount, caseConsultCount, leadContactedCount, leadClosedCount }
}

async function countAlbumDayMetrics(storeId, merchantId, start, end) {
  const [albumCreatedCount, albumCompletedCount] = await Promise.all([
    prisma.album.count({
      where: { storeId, merchantId, createdAt: { gte: start, lte: end } },
    }),
    prisma.album.count({
      where: {
        storeId,
        merchantId,
        completedAt: { gte: start, lte: end },
        status: { in: ['completed', 'pending_authorization', 'pending_review', 'published'] },
      },
    }),
  ])
  return { albumCreatedCount, albumCompletedCount }
}

async function snapshotAlbumCompleteRate(storeId, merchantId) {
  const albums = await prisma.album.findMany({
    where: { storeId, merchantId },
    include: { nodes: true },
  })
  const doneAlbums = albums.filter((a) => isServiceAlbumRepairDone(a.status))
  if (!doneAlbums.length) return null
  const complete = doneAlbums.filter((a) => isAlbumCoreComplete(a.nodes)).length
  return complete / doneAlbums.length
}

async function computeTransparency(merchantId, storeId, statDate, albumCompleteRate) {
  const weekFrom = shanghaiDayBounds(addDays(statDate, -6)).start
  const { end } = shanghaiDayBounds(statDate)

  const [publicCaseCount, plans, merchant, weekSubmit, weekContacted] = await Promise.all([
    prisma.publicCase.count({
      where: { storeId, status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED },
    }),
    prisma.merchantServicePlan.findMany({
      where: { merchantId, storeId },
      select: {
        saleStatus: true,
        name: true,
        summary: true,
        coverUrl: true,
        priceMode: true,
      },
    }),
    prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        licensePhotoUrl: true,
        legalName: true,
        creditCode: true,
        contactPhone: true,
        qualificationJson: true,
      },
    }),
    prisma.consultLead.count({
      where: { storeId, createdAt: { gte: weekFrom, lte: end } },
    }),
    prisma.leadStatusLog.count({
      where: {
        createdAt: { gte: weekFrom, lte: end },
        toStatus: LEAD_STATUS.CONTACTED,
        lead: { storeId },
      },
    }),
  ])

  const albumScore = Math.round(
    (albumCompleteRate != null ? albumCompleteRate : 0) * 25
  )
  const caseScore = Math.round(Math.min(publicCaseCount / 3, 1) * 20)

  const onlinePlans = plans.filter((p) => p.saleStatus === 'ONLINE')
  const profileComplete = onlinePlans.filter(
    (p) => p.name && p.summary && p.coverUrl && p.priceMode
  ).length
  const serviceScore = plans.length
    ? Math.round((profileComplete / Math.max(onlinePlans.length, 1)) * 15)
    : 0

  let qualScore = 0
  if (merchant) {
    let qualParts = 0
    if (merchant.licensePhotoUrl) qualParts += 1
    if (merchant.legalName) qualParts += 1
    if (merchant.creditCode) qualParts += 1
    if (merchant.contactPhone) qualParts += 1
    const qualification =
      merchant.qualificationJson && typeof merchant.qualificationJson === 'object'
        ? merchant.qualificationJson
        : {}
    if (qualification.photoUrl || qualification.type) qualParts += 1
    const validUntil = String(qualification.validUntil || '').trim()
    if (validUntil && validUntil >= formatShanghaiDate(new Date(statDate + 'T12:00:00+08:00'))) {
      qualParts += 1
    } else if (validUntil) {
      qualParts += 0
    } else if (qualification.photoUrl || qualification.type) {
      qualParts += 0.5
    }
    qualScore = Math.round(Math.min(qualParts / 5, 1) * 15)
  }

  const capability = await loadStoreCapabilityById(storeId)
  const techCount = Array.isArray(capability.technicians) ? capability.technicians.length : 0
  const eqCount = Array.isArray(capability.equipmentTags) ? capability.equipmentTags.length : 0
  const capabilityScore = Math.min(5, (techCount > 0 ? 3 : 0) + (eqCount > 0 ? 2 : 0))

  const lastCase = await prisma.publicCase.findFirst({
    where: { storeId, status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED },
    orderBy: { publishedAt: 'desc' },
    select: { publishedAt: true },
  })
  let freshnessScore = 0
  if (lastCase?.publishedAt) {
    const publishedStr =
      lastCase.publishedAt instanceof Date
        ? lastCase.publishedAt.toISOString().slice(0, 10)
        : String(lastCase.publishedAt).slice(0, 10)
    const days = Math.max(
      0,
      Math.floor(
        (new Date(`${statDate}T12:00:00+08:00`) - new Date(`${publishedStr}T12:00:00+08:00`)) /
          (24 * 3600 * 1000)
      )
    )
    if (days <= 30) freshnessScore = 10
    else if (days <= 90) freshnessScore = 6
    else if (days <= 180) freshnessScore = 3
  }
  if (capability.lastProfileVerifiedAt) {
    freshnessScore = Math.min(10, freshnessScore + 2)
  }

  let leadScore = 5
  if (weekSubmit > 0) {
    leadScore = Math.round(Math.min(weekContacted / weekSubmit, 1) * 10)
  }

  const breakdown = {
    album: albumScore,
    case: caseScore,
    serviceProfile: serviceScore,
    qualification: qualScore,
    freshness: freshnessScore,
    capability: capabilityScore,
    leadResponse: leadScore,
  }
  const transparencyScore = Math.min(
    100,
    breakdown.album +
      breakdown.case +
      breakdown.serviceProfile +
      breakdown.qualification +
      breakdown.freshness +
      breakdown.capability +
      breakdown.leadResponse
  )

  return { transparencyScore, breakdown }
}

async function aggregateStoreDay(merchantId, storeId, dateStr) {
  const { start, end } = shanghaiDayBounds(dateStr)
  const [events, leads, albumDay, albumCompleteRate] = await Promise.all([
    countEventMetrics(storeId, start, end),
    countLeadMetrics(storeId, start, end),
    countAlbumDayMetrics(storeId, merchantId, start, end),
    snapshotAlbumCompleteRate(storeId, merchantId),
  ])

  const { transparencyScore } = await computeTransparency(
    merchantId,
    storeId,
    dateStr,
    albumCompleteRate
  )

  const statDate = statDateValue(dateStr)
  const metrics = {
    ...events,
    ...leads,
    ...albumDay,
    albumCompleteRate,
    transparencyScore,
  }

  const existing = await prisma.merchantDailyStats.findFirst({
    where: { merchantId, storeId, statDate },
  })

  if (existing) {
    await prisma.merchantDailyStats.update({
      where: { id: existing.id },
      data: metrics,
    })
    return { merchantId, storeId, statDate, ...metrics }
  }

  try {
    const row = { id: newId('mdst'), merchantId, storeId, statDate, ...metrics }
    await prisma.merchantDailyStats.create({ data: row })
    return row
  } catch (e) {
    if (e.code !== 'P2002') throw e
    const dup = await prisma.merchantDailyStats.findFirst({
      where: { merchantId, storeId, statDate },
    })
    if (!dup) throw e
    await prisma.merchantDailyStats.update({
      where: { id: dup.id },
      data: metrics,
    })
    return { merchantId, storeId, statDate, ...metrics }
  }
}

async function listActiveStorePairs(filters = {}) {
  const where = { status: ACTIVE_MERCHANT_STATUS }
  if (filters.merchantId) where.id = filters.merchantId

  const merchants = await prisma.merchant.findMany({
    where,
    select: {
      id: true,
      stores: { select: { id: true } },
    },
  })

  const pairs = []
  for (const m of merchants) {
    for (const s of m.stores) {
      if (filters.storeId && s.id !== filters.storeId) continue
      pairs.push({ merchantId: m.id, storeId: s.id })
    }
  }
  return pairs
}

async function runDailyAggregation(options = {}) {
  const dateStr = options.date || yesterdayShanghai()
  const pairs = await listActiveStorePairs({
    merchantId: options.merchantId,
    storeId: options.storeId,
  })

  let processed = 0
  for (const pair of pairs) {
    await aggregateStoreDay(pair.merchantId, pair.storeId, dateStr)
    processed += 1
  }

  return { statDate: dateStr, processed }
}

function sumRows(rows) {
  const summary = {
    storeViewCount: 0,
    serviceViewCount: 0,
    caseViewCount: 0,
    h5CaseViewCount: 0,
    mpCaseViewCount: 0,
    geoViewCount: 0,
    crawlerViewCount: 0,
    phoneClickCount: 0,
    leadSubmitCount: 0,
    leadContactedCount: 0,
    leadClosedCount: 0,
    caseConsultCount: 0,
    albumCreatedCount: 0,
    albumCompletedCount: 0,
  }

  for (const r of rows) {
    summary.storeViewCount += r.storeViewCount
    summary.serviceViewCount += r.serviceViewCount
    summary.caseViewCount += r.caseViewCount
    summary.h5CaseViewCount += r.h5CaseViewCount || 0
    summary.mpCaseViewCount += r.mpCaseViewCount || 0
    summary.geoViewCount += r.geoViewCount
    summary.crawlerViewCount += r.crawlerViewCount
    summary.phoneClickCount += r.phoneClickCount
    summary.leadSubmitCount += r.leadSubmitCount
    summary.leadContactedCount += r.leadContactedCount
    summary.leadClosedCount += r.leadClosedCount
    summary.caseConsultCount += r.caseConsultCount
    summary.albumCreatedCount += r.albumCreatedCount
    summary.albumCompletedCount += r.albumCompletedCount
  }

  const viewTotal =
    summary.storeViewCount + summary.serviceViewCount + summary.caseViewCount
  const rates = {
    leadRate: viewTotal > 0 ? summary.leadSubmitCount / viewTotal : null,
    contactRate:
      summary.leadSubmitCount > 0
        ? summary.leadContactedCount / summary.leadSubmitCount
        : null,
    caseConsultRate:
      summary.caseViewCount > 0
        ? summary.caseConsultCount / summary.caseViewCount
        : null,
  }

  const completeRates = rows
    .map((r) => r.albumCompleteRate)
    .filter((v) => v != null)
  summary.albumCompleteRate = completeRates.length
    ? completeRates.reduce((a, b) => a + b, 0) / completeRates.length
    : null

  const scores = rows.map((r) => r.transparencyScore).filter((n) => n > 0)
  summary.transparencyScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0

  return { ...summary, rates }
}

function formatStatDate(row) {
  if (!row.statDate) return ''
  return row.statDate instanceof Date
    ? formatShanghaiDate(row.statDate)
    : String(row.statDate).slice(0, 10)
}

async function resolveMerchantAuthContext(auth) {
  if (auth.staffRole) return auth
  if (auth.userId && auth.merchantId) {
    const staff = await prisma.merchantStaff.findFirst({
      where: {
        merchantId: auth.merchantId,
        userId: auth.userId,
        status: 'ACTIVE',
      },
      select: { role: true, storeId: true },
    })
    if (staff) {
      return {
        ...auth,
        staffRole: staff.role,
        storeId: auth.storeId || staff.storeId,
      }
    }
  }
  return { ...auth, staffRole: 'owner', storeId: auth.storeId }
}

async function resolveStoreScope(merchantId, staffRole, staffStoreId, queryStoreId) {
  const stores = await prisma.store.findMany({
    where: { merchantId },
    select: { id: true },
  })
  const allIds = stores.map((s) => s.id)

  if (staffRole !== 'owner') {
    const bound = staffStoreId || allIds[0] || ''
    if (queryStoreId && queryStoreId !== bound) {
      const err = new Error('无权查看该门店数据')
      err.status = 403
      throw err
    }
    return bound ? [bound] : []
  }

  if (queryStoreId) {
    if (!allIds.includes(queryStoreId)) {
      const err = new Error('门店不存在')
      err.status = 404
      throw err
    }
    return [queryStoreId]
  }

  return allIds
}

async function fetchMerchantStats(auth, query = {}) {
  const ctx = await resolveMerchantAuthContext(auth)
  const merchantId = ctx.merchantId
  if (!merchantId) {
    const err = new Error('尚未开通商家身份')
    err.status = 403
    throw err
  }

  const storeIds = await resolveStoreScope(
    merchantId,
    ctx.staffRole || 'owner',
    ctx.storeId,
    query.storeId
  )

  const period = query.period || '7d'
  const range = resolvePeriodRange(period, query.from, query.to)
  const fromDate = statDateValue(range.from)
  const toDate = statDateValue(range.to)

  const rows = await prisma.merchantDailyStats.findMany({
    where: {
      merchantId,
      storeId: { in: storeIds },
      statDate: { gte: fromDate, lte: toDate },
    },
    orderBy: { statDate: 'asc' },
  })

  const summary = sumRows(rows)
  const dateKeys = listDateStrings(range.from, range.to)
  const byDate = Object.fromEntries(
    dateKeys.map((d) => [
      d,
      {
        date: d,
        storeViewCount: 0,
        serviceViewCount: 0,
        caseViewCount: 0,
        h5CaseViewCount: 0,
        mpCaseViewCount: 0,
        geoViewCount: 0,
        crawlerViewCount: 0,
        phoneClickCount: 0,
        leadSubmitCount: 0,
        leadContactedCount: 0,
        leadClosedCount: 0,
        caseConsultCount: 0,
      },
    ])
  )

  for (const row of rows) {
    const d = formatStatDate(row)
    if (!byDate[d]) continue
    const item = byDate[d]
    item.storeViewCount += row.storeViewCount
    item.serviceViewCount += row.serviceViewCount
    item.caseViewCount += row.caseViewCount
    item.h5CaseViewCount += row.h5CaseViewCount || 0
    item.mpCaseViewCount += row.mpCaseViewCount || 0
    item.geoViewCount += row.geoViewCount
    item.crawlerViewCount += row.crawlerViewCount
    item.phoneClickCount += row.phoneClickCount
    item.leadSubmitCount += row.leadSubmitCount
    item.leadContactedCount += row.leadContactedCount
    item.leadClosedCount += row.leadClosedCount
    item.caseConsultCount += row.caseConsultCount
  }

  const series = dateKeys.map((d) => byDate[d])

  const lastRow = await prisma.merchantDailyStats.findFirst({
    where: { merchantId, storeId: { in: storeIds } },
    orderBy: { statDate: 'desc' },
  })
  const lastAggregatedDate = lastRow ? formatStatDate(lastRow) : ''

  let transparency = { score: 0, asOfDate: '', breakdown: null }
  if (lastRow) {
    const { breakdown } = await computeTransparency(
      merchantId,
      storeIds.length === 1 ? storeIds[0] : storeIds[0],
      formatStatDate(lastRow),
      lastRow.albumCompleteRate
    )
    transparency = {
      score: lastRow.transparencyScore,
      asOfDate: formatStatDate(lastRow),
      breakdown,
    }
  }

  const insights = await fetchStatsInsights(merchantId, storeIds, range, {
    transparencyScore: transparency.score,
  })

  return {
    range: { from: range.from, to: range.to },
    storeId: storeIds.length === 1 ? storeIds[0] : '',
    storeIds,
    dataLag: 'T+1',
    lastAggregatedDate,
    summary,
    series,
    transparency,
    rankings: {
      cases: insights.topCases,
      services: insights.topServices,
    },
    suggestions: insights.suggestions,
    metricNotes: MERCHANT_METRIC_NOTES,
  }
}

module.exports = {
  aggregateStoreDay,
  runDailyAggregation,
  fetchMerchantStats,
  snapshotAlbumCompleteRate,
  computeTransparency,
}
