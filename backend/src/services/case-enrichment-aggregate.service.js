/**
 * CASE-ENR-04 · IGAIN 聚合 FAQ 写入 case enrichment_json 与 geo_pages
 */
const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { CASE_ARTICLE_H5_PUBLISHED_STATUSES } = require('../constants/case-article-status')
const { extractSnapshotFromContentJson } = require('../schemas/case-snapshot.schema')
const { resolveCaseEnrichment } = require('../schemas/case-enrichment.schema')
const { mapGeoPageRow, normalizeFaq } = require('../schemas/geo-page.schema')
const { resolveH5ServiceItemById } = require('../constants/h5-service-items')
const { buildCaseMountItemFromRow } = require('../utils/case-geo-mount')
const { resolveServiceItemIdFromPage } = require('./geo-service-catalog.service')
const {
  aggregatePublicCases,
  buildDerivedAggregateFaq,
  mergeDerivedFaq,
  applyAggregateToServiceContent,
} = require('./geo-case-aggregate.service')
const { persistCaseEnrichmentForRow } = require('./case-enrichment.service')
const { orderCasesByIds } = require('../utils/geo-topic-matcher')

function mapPublicCaseRowToAggregateInput(row) {
  if (!row) return null
  const content = row.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
  const snapshot = extractSnapshotFromContentJson(content)
  const enrichment = resolveCaseEnrichment(row)
  const geo = enrichment?.geo || snapshot?.geo || content.geo || {}
  const price = snapshot?.price && typeof snapshot.price === 'object' ? snapshot.price : {}

  return {
    id: row.id,
    inspectResult: geo.inspectResult || content.inspectResult || '',
    planAmount:
      price.planAmount ??
      snapshot?.planAmount ??
      (row.minAmount != null && row.maxAmount != null && row.minAmount === row.maxAmount
        ? row.minAmount
        : null),
    minAmount: price.minAmount ?? row.minAmount ?? null,
    maxAmount: price.maxAmount ?? row.maxAmount ?? null,
    priceMode: price.priceMode || row.priceMode || 'range',
    seoNoindex: enrichment?.seoNoindex ?? Boolean(row.seoNoindex),
  }
}

function resolvePriceModeForAggregate(row, mountItem) {
  const snapshot = extractSnapshotFromContentJson(row.contentJson)
  const price = snapshot?.price
  if (price?.priceMode) return price.priceMode
  return row.priceMode || mountItem?.priceMode || 'range'
}

/**
 * @param {object} row public_cases 行（可含 album）
 * @param {object} db
 * @param {{ limit?: number }} [options]
 */
async function loadPeerCasesForCaseAggregate(row, db, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 200)
  const mountItem = buildCaseMountItemFromRow(row, row.album)
  const serviceName = mountItem.serviceName || row.serviceName || ''
  if (!serviceName) return [row]

  const where = {
    status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
    articleStatus: { in: CASE_ARTICLE_H5_PUBLISHED_STATUSES },
    serviceName,
  }
  if (mountItem.city) where.city = mountItem.city

  const peers = await db.publicCase.findMany({
    where,
    take: limit,
    orderBy: { publishedAt: 'desc' },
  })

  if (!peers.length) return [row]
  const hasSelf = peers.some((item) => item.id === row.id)
  return hasSelf ? peers : [row, ...peers].slice(0, limit)
}

function buildDerivedFaqForCaseRow(row, peerRows) {
  const mountItem = buildCaseMountItemFromRow(row, row.album)
  const aggregateCases = (peerRows || [])
    .map(mapPublicCaseRowToAggregateInput)
    .filter(Boolean)
  const aggregateStats = aggregatePublicCases(aggregateCases, {
    serviceName: mountItem.serviceName,
    city: mountItem.city,
    priceMode: resolvePriceModeForAggregate(row, mountItem),
  })

  const derivedFaq = buildDerivedAggregateFaq({
    serviceName: mountItem.serviceName,
    city: mountItem.city,
    aggregateStats,
  })

  return { derivedFaq, aggregateStats, mountItem }
}

function faqSignature(faq = []) {
  return JSON.stringify(
    (faq || []).map((item) => ({
      q: String(item.q || item.question || '').trim(),
      a: String(item.a || item.answer || '').trim(),
    }))
  )
}

/**
 * @param {string} caseId
 * @param {{ db?: object, row?: object, bumpVersion?: boolean }} [options]
 */
async function applyAggregateFaqToCaseEnrichment(caseId, options = {}) {
  const db = options.db || prisma
  const row =
    options.row ||
    (await db.publicCase.findUnique({
      where: { id: caseId },
      include: { album: true },
    }))
  if (!row) return { skipped: true, reason: 'not_found' }

  const peerRows = await loadPeerCasesForCaseAggregate(row, db)
  const { derivedFaq, aggregateStats } = buildDerivedFaqForCaseRow(row, peerRows)
  if (!derivedFaq.length) {
    return { skipped: true, reason: 'no_derived_faq', sampleSize: aggregateStats.sampleSize || 0 }
  }

  const enrichment = resolveCaseEnrichment(row)
  const mergedFaq = mergeDerivedFaq(enrichment?.faq || [], derivedFaq)
  if (faqSignature(enrichment?.faq) === faqSignature(mergedFaq)) {
    return {
      skipped: true,
      reason: 'unchanged',
      derivedCount: derivedFaq.length,
      sampleSize: aggregateStats.sampleSize || 0,
    }
  }

  await persistCaseEnrichmentForRow(
    row,
    { faq: mergedFaq },
    {
      db,
      bumpVersion: options.bumpVersion !== false,
      syncContentJsonGeo: true,
    }
  )

  return {
    applied: true,
    derivedCount: derivedFaq.length,
    faqCount: mergedFaq.length,
    sampleSize: aggregateStats.sampleSize || 0,
  }
}

function resolveGeoPageServiceMeta(page) {
  const serviceItemId = resolveServiceItemIdFromPage(page)
  const serviceItem = serviceItemId ? resolveH5ServiceItemById(serviceItemId) : null
  const serviceName =
    serviceItem?.name ||
    page.serviceMeta?.displayName ||
    page.title ||
    '相关维修项目'
  return { serviceItem, serviceName, serviceItemId }
}

/**
 * @param {string} geoPageId
 * @param {object} db
 */
async function refreshGeoPageAggregateFaq(geoPageId, db) {
  const row = await db.geoPage.findUnique({ where: { id: geoPageId } })
  if (!row) return { skipped: true, reason: 'page_not_found', geoPageId }

  const page = mapGeoPageRow(row)
  const { serviceItem, serviceName } = resolveGeoPageServiceMeta(page)
  const caseIds = Array.isArray(page.relatedCaseIds) ? page.relatedCaseIds : []

  let caseRows = []
  if (caseIds.length) {
    const fetched = await db.publicCase.findMany({
      where: {
        id: { in: caseIds },
        status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      },
    })
    const ordered = orderCasesByIds(fetched, caseIds, caseIds.length)
    caseRows = ordered
  }

  if (!caseRows.length) {
    return { skipped: true, reason: 'no_cases', geoPageId }
  }

  const aggregateCases = caseRows.map(mapPublicCaseRowToAggregateInput).filter(Boolean)
  const aggregated = applyAggregateToServiceContent({
    cases: aggregateCases,
    serviceName,
    city: page.city,
    priceMode: serviceItem?.priceMode,
    aiSummary: page.aiSummary || '',
    faq: page.faq || [],
  })

  const nextFaq = normalizeFaq(aggregated.faq || [])
  const data = {}
  if (faqSignature(page.faq) !== faqSignature(nextFaq)) {
    data.faqJson = nextFaq
  }

  const nextSummary = String(aggregated.aiSummary || '').trim()
  const prevSummary = String(page.aiSummary || '').trim()
  const pageSummary = String(page.summary || '').trim()
  const canRefreshSummary =
    !prevSummary || prevSummary === pageSummary || prevSummary === String(row.summary || '').trim()
  if (nextSummary && canRefreshSummary && nextSummary !== prevSummary) {
    data.aiSummary = nextSummary
  }

  if (!Object.keys(data).length) {
    return {
      skipped: true,
      reason: 'unchanged',
      geoPageId,
      sampleSize: aggregated.aggregateStats?.sampleSize || 0,
    }
  }

  await db.geoPage.update({
    where: { id: geoPageId },
    data,
  })

  return {
    applied: true,
    geoPageId,
    faqCount: nextFaq.length,
    sampleSize: aggregated.aggregateStats?.sampleSize || 0,
    updatedFields: Object.keys(data),
  }
}

/**
 * @param {string[]} geoPageIds
 * @param {object} db
 */
async function refreshGeoPagesAggregateFaq(geoPageIds = [], db) {
  const results = []
  for (const geoPageId of geoPageIds || []) {
    results.push(await refreshGeoPageAggregateFaq(geoPageId, db))
  }
  return results
}

/**
 * @param {{ limit?: number, caseId?: string }} [options]
 */
async function backfillCaseEnrichmentAggregateFaq(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 200, 1), 2000)
  const where = {
    status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
    articleStatus: { in: CASE_ARTICLE_H5_PUBLISHED_STATUSES },
  }
  if (options.caseId) where.id = options.caseId

  const rows = await prisma.publicCase.findMany({
    where,
    take: limit,
    orderBy: { updatedAt: 'desc' },
    include: { album: true },
  })

  let applied = 0
  let skipped = 0
  for (const row of rows) {
    const result = await applyAggregateFaqToCaseEnrichment(row.id, {
      row,
      bumpVersion: true,
    })
    if (result.applied) applied += 1
    else skipped += 1
  }

  return { total: rows.length, applied, skipped }
}

module.exports = {
  mapPublicCaseRowToAggregateInput,
  loadPeerCasesForCaseAggregate,
  buildDerivedFaqForCaseRow,
  applyAggregateFaqToCaseEnrichment,
  refreshGeoPageAggregateFaq,
  refreshGeoPagesAggregateFaq,
  backfillCaseEnrichmentAggregateFaq,
}
