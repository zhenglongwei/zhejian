const { getGeoPageDetail } = require('./geo.service')
const { listCases } = require('./content.service')
const { resolveServiceItemIdFromPage } = require('./geo-service-catalog.service')
const { resolveH5ServiceItemById } = require('../constants/h5-service-items')
const { applyAggregateToServiceContent } = require('./geo-case-aggregate.service')
const { applyAggregateToVehicleTopicContent } = require('./geo-vehicle-topic.service')
const { filterCasesForGeoPage, orderCasesByIds } = require('../utils/geo-topic-matcher')

function mapCaseItem(item) {
  return {
    id: item.id,
    slug: item.slug || (item.seo && item.seo.slug) || '',
    title: item.title,
    serviceName: item.serviceName,
    summary: item.summary,
    vehicleText: item.vehicleText || '',
    coverImage: item.coverImage || '',
    coverImageDesensitized: item.coverImageDesensitized || item.coverImage || '',
    priceMode: item.priceMode || 'range',
    amount: item.amount,
    minAmount: item.minAmount,
    maxAmount: item.maxAmount,
    authorizationTier: item.authorizationTier,
    storeId: item.storeId,
    storeName: item.storeName,
    city: item.city || '',
    publishedAt: item.publishedAt || '',
    viewCount: item.viewCount || 0,
    distanceKm: item.distanceKm != null ? item.distanceKm : null,
  }
}

function mapStoreItem(item) {
  return {
    id: item.id,
    name: item.name,
    address: item.address,
    businessHours: item.businessHours,
    phone: item.phone || '',
    caseCount: item.caseCount || 0,
    coverImage: item.coverImage || '',
  }
}

function buildTopicSeo(page, { allowIndex, caseCount }) {
  const forceNoindex = page.status === 'noindex'
  const displayName = page.serviceMeta?.displayName || page.title
  const empty = !caseCount
  const title = empty
    ? `${displayName}：公开维修记录（暂无） · 辙见`
    : `${displayName}：公开维修记录 · 辙见`
  const description = empty
    ? `${displayName}在辙见里会展示门店公开的检查和维修过程。目前还没有公开记录。`
    : page.seoDescription ||
      page.aiSummary ||
      page.summary ||
      `查看${displayName}门店确认后公开的维修记录。平台不做线下验真，车主仍以到店为准。`
  const indexable = allowIndex && !forceNoindex
  return {
    title,
    description,
    canonicalPath: `/topic/${page.slug}`,
    robots: indexable ? 'index,follow' : 'noindex,follow',
    allowIndex: indexable,
    legacyCanonicalPath: '',
  }
}

async function resolveAggregateCasesForGeoPage(page, relatedCases) {
  const manualIds = Array.isArray(page.relatedCaseIds) ? page.relatedCaseIds : []
  if (manualIds.length) {
    const ordered = orderCasesByIds(relatedCases, manualIds, 200)
    if (ordered.length) return ordered
  }

  const serviceItemId = resolveServiceItemIdFromPage(page)
  const serviceItem = serviceItemId ? resolveH5ServiceItemById(serviceItemId) : null
  const { list } = await listCases({
    serviceItemId: serviceItemId || undefined,
    city: page.city || undefined,
    limit: 200,
  })

  const matched = filterCasesForGeoPage(page, list, { serviceItem })
  if (matched.length) return matched
  return relatedCases || []
}

function applyTopicAggregate(detail, cases) {
  const serviceMeta = detail.serviceMeta || {}
  const serviceName = serviceMeta.displayName || detail.title
  const baseAiSummary = detail.aiSummary || detail.summary || ''
  const baseFaq = detail.faq || []

  if (detail.pageType === 'vehicle_service' && detail.vehicleSeries) {
    return applyAggregateToVehicleTopicContent({
      cases,
      serviceName,
      vehicleSeries: detail.vehicleSeries,
      city: detail.city,
      priceMode: serviceMeta.priceMode,
      aiSummary: baseAiSummary,
      faq: baseFaq,
    })
  }

  return applyAggregateToServiceContent({
    cases,
    serviceName,
    city: detail.city,
    priceMode: serviceMeta.priceMode,
    aiSummary: baseAiSummary,
    faq: baseFaq,
  })
}

async function getGeoTopicPagePayload(slugOrId) {
  const detail = await getGeoPageDetail(slugOrId)
  const catalogStats = detail.catalogStats || {}
  const caseCount = detail.isServiceBase
    ? catalogStats.caseTotal ?? detail.relatedCaseCount
    : detail.relatedCaseCount
  const storeCount = detail.isServiceBase
    ? catalogStats.storeTotal ?? detail.relatedStoreCount
    : detail.relatedStoreCount

  const aggregateCases = await resolveAggregateCasesForGeoPage(detail, detail.relatedCases || [])
  const effectiveCaseCount = aggregateCases.length || caseCount
  const allowIndex = effectiveCaseCount > 0 || storeCount > 0

  const displayName = detail.serviceMeta?.displayName || detail.title
  const aggregated = applyTopicAggregate(detail, aggregateCases)
  const aiSummary = effectiveCaseCount
    ? aggregated.aiSummary || detail.aiSummary || detail.summary || ''
    : `${displayName}在辙见里会展示门店公开的检查和维修过程。目前还没有公开记录。`
  const sourceCases = (aggregateCases || []).slice(0, 3).map((item) => ({
    id: item.id,
    slug: item.slug || '',
    title: item.title || item.serviceName || '公开档案',
  }))
  const faq = effectiveCaseCount
    ? (aggregated.faq || []).slice(0, 5).map((row) => ({
        q: row.q || row.question || '',
        a: row.a || row.answer || '',
        sourceCases,
      }))
    : []
  const evidenceNotes = aggregated.evidenceNotes || []
  const aggregateStats = aggregated.aggregateStats || null

  return {
    topic: {
      id: detail.id,
      slug: detail.slug,
      title: detail.title,
      summary: detail.summary,
      coverImage: detail.coverImage || '',
      city: detail.city,
      pageType: detail.pageType,
      pageTypeLabel: detail.pageTypeLabel,
      updatedAt: detail.updatedAt,
      keywords: detail.keywords || [],
      aiSummary,
      isAccidentTopic: detail.isAccidentTopic,
      isServiceBase: detail.isServiceBase,
      serviceItemId: detail.serviceItemId || '',
      displayName: detail.serviceMeta?.displayName || detail.title,
      priceMode: detail.serviceMeta?.priceMode || 'range',
      primaryStoreId: detail.primaryStoreId || '',
      relatedServiceId: detail.relatedServiceId || '',
    },
    process: detail.serviceMeta?.process || [],
    referencePrice: detail.referencePrice || null,
    relatedTopics: detail.relatedTopics || [],
    scenarios: detail.scenarios || [],
    priceFactors: detail.priceFactors || [],
    faq,
    evidenceNotes,
    faqLinks: detail.faqLinks || [],
    relatedCases: (aggregateCases.length ? aggregateCases : detail.relatedCases || []).map(mapCaseItem),
    relatedStores: (detail.relatedStores || []).map(mapStoreItem),
    primaryStore: detail.primaryStore ? mapStoreItem(detail.primaryStore) : null,
    stats: {
      caseCount: effectiveCaseCount,
      storeCount,
      matchedCaseCount: aggregateStats?.sampleSize ?? null,
    },
    aggregateStats,
    sortOptions: [
      { value: 'recommend', label: '综合推荐' },
      { value: 'newest', label: '最新发布' },
      { value: 'cases', label: '浏览较多' },
    ],
    seo: buildTopicSeo({ ...detail, aiSummary }, { allowIndex, caseCount: effectiveCaseCount }),
  }
}

async function getPublicTopicPagePayload(slugOrId) {
  try {
    return await getGeoTopicPagePayload(slugOrId)
  } catch (err) {
    if (!err || err.status !== 404) throw err
    const { resolveLegacyTopicRedirect } = require('../utils/geo-page-service-resolve')
    const legacy = resolveLegacyTopicRedirect(slugOrId)
    const loc = legacy && legacy.location ? String(legacy.location) : ''
    const topicMatch = loc.match(/\/topic\/([a-z0-9-]+)/i)
    const serviceMatch = loc.match(/\/service\/([a-z0-9-]+)/i)
    const nextSlug = (topicMatch && topicMatch[1]) || (serviceMatch && serviceMatch[1]) || ''
    if (nextSlug && nextSlug !== slugOrId) {
      return getGeoTopicPagePayload(nextSlug)
    }
    throw err
  }
}

module.exports = {
  getGeoTopicPagePayload,
  getPublicTopicPagePayload,
  resolveAggregateCasesForGeoPage,
  applyTopicAggregate,
}
