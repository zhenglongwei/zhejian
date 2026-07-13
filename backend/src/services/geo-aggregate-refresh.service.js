/**
 * GEO-AGG-11 · 已发布 GEO 专题日级聚合重算（写入 aiSummary/FAQ + aggregateCache）
 */
const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { GEO_PAGE_STATUS, GEO_PAGE_TYPE } = require('../constants/geo-page-status')
const { mapGeoPageRow, normalizeFaq } = require('../schemas/geo-page.schema')
const { resolveH5ServiceItemById } = require('../constants/h5-service-items')
const { listCases } = require('./content.service')
const { resolveServiceItemIdFromPage } = require('./geo-service-catalog.service')
const {
  applyAggregateToServiceContent,
} = require('./geo-case-aggregate.service')
const { applyAggregateToVehicleTopicContent } = require('./geo-vehicle-topic.service')
const { filterCasesForGeoPage, orderCasesByIds } = require('../utils/geo-topic-matcher')

const PUBLIC_STATUSES = [GEO_PAGE_STATUS.PUBLISHED, GEO_PAGE_STATUS.NOINDEX]
const FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function faqSignature(faq = []) {
  return JSON.stringify(
    (faq || []).map((item) => ({
      q: String(item.q || item.question || '').trim(),
      a: String(item.a || item.answer || '').trim(),
    }))
  )
}

function mapCaseForAggregate(caseItem) {
  if (!caseItem) return null
  if (caseItem.seoNoindex) return null
  return {
    id: caseItem.id,
    inspectResult: caseItem.inspectResult || '',
    planAmount: caseItem.planAmount ?? caseItem.amount ?? null,
    minAmount: caseItem.minAmount ?? null,
    maxAmount: caseItem.maxAmount ?? null,
    priceMode: caseItem.priceMode || 'range',
    seoNoindex: Boolean(caseItem.seoNoindex),
    mileageKm: caseItem.mileageKm ?? null,
    vehicleText: caseItem.vehicleText || '',
    trustMeta: caseItem.trustMeta || null,
    serviceName: caseItem.serviceName || '',
    serviceItemId: caseItem.serviceItemId || '',
    city: caseItem.city || '',
  }
}

function resolveGeoPageServiceMeta(page) {
  const serviceItemId = resolveServiceItemIdFromPage(page)
  const serviceItem = serviceItemId ? resolveH5ServiceItemById(serviceItemId) : null
  const serviceName =
    serviceItem?.name || page.serviceMeta?.displayName || page.title || '相关维修项目'
  return { serviceItem, serviceName, serviceItemId }
}

function resolveAggregateCasesForPage(page, allCases = []) {
  const { serviceItem } = resolveGeoPageServiceMeta(page)
  const manualIds = Array.isArray(page.relatedCaseIds) ? page.relatedCaseIds : []
  if (manualIds.length) {
    const ordered = orderCasesByIds(allCases, manualIds, manualIds.length)
    if (ordered.length) return ordered
  }
  return filterCasesForGeoPage(page, allCases, { serviceItem })
}

function buildAggregateCache(aggregateStats) {
  const computedAt = aggregateStats?.computedAt || new Date().toISOString()
  const sampleSize = Number(aggregateStats?.sampleSize) || 0
  const signature = crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        sampleSize,
        cause: aggregateStats?.causeDistribution?.slice(0, 3) || [],
        advanced: aggregateStats?.advanced
          ? {
              mileageBands: aggregateStats.advanced.mileageBands?.slice(0, 2) || [],
              inspectToPlan: aggregateStats.advanced.inspectToPlan?.slice(0, 2) || [],
            }
          : null,
      })
    )
    .digest('hex')
    .slice(0, 16)
  return { computedAt, sampleSize, signature }
}

function buildAggregateForPage(page, matchedCases) {
  const { serviceItem, serviceName } = resolveGeoPageServiceMeta(page)
  const aggregateCases = matchedCases.map(mapCaseForAggregate).filter(Boolean)
  const baseFaq = page.faq || []

  if (page.pageType === GEO_PAGE_TYPE.VEHICLE_SERVICE && page.vehicleSeries) {
    return applyAggregateToVehicleTopicContent({
      cases: aggregateCases,
      serviceName,
      vehicleSeries: page.vehicleSeries,
      city: page.city,
      priceMode: serviceItem?.priceMode,
      aiSummary: page.aiSummary || '',
      faq: baseFaq,
    })
  }

  return applyAggregateToServiceContent({
    cases: aggregateCases,
    serviceName,
    city: page.city,
    priceMode: serviceItem?.priceMode,
    aiSummary: page.aiSummary || '',
    faq: baseFaq,
  })
}

function canAutoRefreshAiSummary(page, row) {
  const prevSummary = String(page.aiSummary || '').trim()
  const pageSummary = String(page.summary || '').trim()
  const rowSummary = String(row.summary || '').trim()
  return !prevSummary || prevSummary === pageSummary || prevSummary === rowSummary
}

/**
 * @param {import('@prisma/client').GeoPage | object} row
 * @param {object[]} [allCases]
 * @param {{ dryRun?: boolean }} [options]
 */
async function refreshGeoPageAggregate(row, allCases = [], options = {}) {
  const dryRun = Boolean(options.dryRun)
  const page = mapGeoPageRow(row)
  if (!PUBLIC_STATUSES.includes(page.status)) {
    return { skipped: true, reason: 'not_public', geoPageId: page.id, slug: page.slug }
  }

  const matchedCases = resolveAggregateCasesForPage(page, allCases)
  if (!matchedCases.length) {
    return { skipped: true, reason: 'no_cases', geoPageId: page.id, slug: page.slug }
  }

  const aggregated = buildAggregateForPage(page, matchedCases)
  const nextFaq = normalizeFaq(aggregated.faq || [])
  const nextSummary = String(aggregated.aiSummary || '').trim()
  const aggregateCache = buildAggregateCache(aggregated.aggregateStats)
  const prevCache = page.serviceMeta?.aggregateCache || {}
  const statsChanged = prevCache.signature !== aggregateCache.signature

  const data = {}
  if (faqSignature(page.faq) !== faqSignature(nextFaq)) {
    data.faqJson = nextFaq
  }

  if (
    nextSummary &&
    (canAutoRefreshAiSummary(page, row) || !String(page.aiSummary || '').trim()) &&
    nextSummary !== String(page.aiSummary || '').trim()
  ) {
    data.aiSummary = nextSummary
  }

  if (statsChanged) {
    data.serviceMetaJson = {
      ...(page.serviceMeta || {}),
      aggregateCache,
    }
  }

  if (!Object.keys(data).length) {
    return {
      skipped: true,
      reason: 'unchanged',
      geoPageId: page.id,
      slug: page.slug,
      sampleSize: aggregateCache.sampleSize,
    }
  }

  if (!dryRun) {
    await prisma.geoPage.update({
      where: { id: page.id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    })
  }

  return {
    applied: true,
    dryRun,
    geoPageId: page.id,
    slug: page.slug,
    sampleSize: aggregateCache.sampleSize,
    updatedFields: Object.keys(data),
    computedAt: aggregateCache.computedAt,
  }
}

/**
 * @param {{ dryRun?: boolean, limit?: number, slug?: string }} [options]
 */
async function refreshAllGeoPageAggregates(options = {}) {
  const dryRun = Boolean(options.dryRun)
  const limit = options.limit != null ? Math.max(1, Number(options.limit) || 0) : 0
  const slug = String(options.slug || '').trim()

  const where = { status: { in: PUBLIC_STATUSES } }
  if (slug) where.slug = slug

  const [rows, casesResult] = await Promise.all([
    prisma.geoPage.findMany({
      where,
      orderBy: [{ updatedAt: 'asc' }],
      ...(limit > 0 ? { take: limit } : {}),
    }),
    listCases({ limit: 500 }),
  ])
  const allCases = casesResult.list || []

  const results = []
  let applied = 0
  let skipped = 0
  let unchanged = 0
  let errors = 0

  for (const row of rows) {
    try {
      const result = await refreshGeoPageAggregate(row, allCases, { dryRun })
      results.push(result)
      if (result.applied) applied += 1
      else if (result.reason === 'unchanged') unchanged += 1
      else skipped += 1
    } catch (error) {
      errors += 1
      results.push({
        geoPageId: row.id,
        slug: row.slug,
        error: error.message || 'refresh_failed',
      })
    }
  }

  return {
    dryRun,
    total: rows.length,
    applied,
    skipped,
    unchanged,
    errors,
    refreshedAt: new Date().toISOString(),
    results,
  }
}

/**
 * @param {{ limit?: number }} [options]
 */
async function computeAggregateFreshnessMetrics(options = {}) {
  const limit = options.limit != null ? Math.max(1, Number(options.limit) || 0) : 0
  const rows = await prisma.geoPage.findMany({
    where: { status: { in: PUBLIC_STATUSES } },
    select: { id: true, slug: true, serviceMetaJson: true },
    ...(limit > 0 ? { take: limit } : {}),
  })

  const now = Date.now()
  let withCache = 0
  let fresh = 0

  rows.forEach((row) => {
    const meta =
      row.serviceMetaJson && typeof row.serviceMetaJson === 'object' ? row.serviceMetaJson : {}
    const computedAt = String(meta.aggregateCache?.computedAt || '').trim()
    if (!computedAt) return
    withCache += 1
    const ts = Date.parse(computedAt)
    if (Number.isFinite(ts) && now - ts <= FRESHNESS_WINDOW_MS) fresh += 1
  })

  const total = rows.length
  return {
    total,
    withCache,
    fresh,
    aggregate_freshness: total ? fresh / total : 0,
    cache_coverage: total ? withCache / total : 0,
    windowDays: 7,
  }
}

module.exports = {
  FRESHNESS_WINDOW_MS,
  refreshGeoPageAggregate,
  refreshAllGeoPageAggregates,
  computeAggregateFreshnessMetrics,
  resolveAggregateCasesForPage,
  buildAggregateCache,
}
