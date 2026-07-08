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
    viewCount: item.viewCount || 0,
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

function buildTopicSeo(page, { allowIndex }) {
  const forceNoindex = page.status === 'noindex'
  const isServiceBase = page.pageType === 'service_base'
  const displayName = page.serviceMeta?.displayName || page.title
  const title =
    page.seoTitle ||
    (isServiceBase
      ? `${displayName}价格参考与维修案例_透明汽车维修平台 · 辙见`
      : `${page.title}_本地汽车维修专题 · 辙见`)
  const description =
    page.seoDescription ||
    page.aiSummary ||
    page.summary ||
    (isServiceBase
      ? `了解${displayName}适用情况、维修流程、参考价格、价格影响因素和真实维修案例，可预约本地辙见门店。`
      : `查看${page.city || ''}${page.title}相关门店、脱敏案例与常见问题，价格仅供参考。`)
  const indexable = allowIndex && !forceNoindex
  return {
    title,
    description,
    canonicalPath: `/topic/${page.slug}`,
    robots: indexable ? 'index,follow' : 'noindex,follow',
    allowIndex: indexable,
    legacyCanonicalPath: isServiceBase ? `/service/${page.slug}.html` : '',
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

  const aggregated = applyTopicAggregate(detail, aggregateCases)
  const aiSummary = aggregated.aiSummary || detail.aiSummary || detail.summary || ''
  const faq = aggregated.faq || detail.faq || []
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
    seo: buildTopicSeo({ ...detail, aiSummary }, { allowIndex }),
  }
}

module.exports = {
  getGeoTopicPagePayload,
  resolveAggregateCasesForGeoPage,
  applyTopicAggregate,
}
