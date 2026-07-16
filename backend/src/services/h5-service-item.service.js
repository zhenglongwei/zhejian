const { resolveH5ServiceItemBySlug } = require('../constants/h5-service-items')
const { listCases, listMerchants, listServices } = require('./content.service')
const {
  loadGeoOverlayForServiceItem,
  listPublishedTopicsForServiceItem,
  mergeServiceItemWithGeo,
} = require('./h5-service-geo-merge.service')
const { applyAggregateToServiceContent, aggregatePublicCases } = require('./geo-case-aggregate.service')
const { buildServicePageSchemaGraph } = require('../lib/schema-graph')
const { config } = require('../config')
const { orderCasesByIds } = require('../utils/geo-topic-matcher')

const CASE_LIMIT = 6
const STORE_LIMIT = 6

function mapCaseListItem(item) {
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
  }
}

function buildCaseReferencePrice(item, cases) {
  if (!cases || !cases.length) return null

  const stats = aggregatePublicCases(cases, {
    serviceName: item.name,
    priceMode: item.priceMode,
  })
  const price = stats.price
  if (!price || !price.sampleSize) return null

  return {
    mode: item.priceMode || 'range',
    min: price.low,
    max: price.high,
    average: price.average,
    sampleSize: price.sampleSize,
    text:
      price.low === price.high
        ? `¥${price.low}`
        : `¥${price.low}–¥${price.high}`,
    note: `基于 ${price.sampleSize} 条脱敏案例汇总，实际费用以门店检测为准。`,
  }
}

function buildRecommendedStores(plans, merchants, caseCountByStore) {
  const merchantMap = new Map((merchants || []).map((m) => [m.id, m]))
  const byStore = new Map()

  ;(plans || []).forEach((plan) => {
    if (!merchantMap.has(plan.storeId)) return
    const existing = byStore.get(plan.storeId)
    if (!existing) {
      byStore.set(plan.storeId, plan)
      return
    }
    const existingAmount = existing.minAmount ?? existing.amount ?? Infinity
    const planAmount = plan.minAmount ?? plan.amount ?? Infinity
    if (planAmount < existingAmount) byStore.set(plan.storeId, plan)
  })

  return [...byStore.entries()]
    .map(([storeId, plan]) => {
      const store = merchantMap.get(storeId)
      return {
        id: store.id,
        name: store.name,
        address: store.address,
        businessHours: store.businessHours,
        phone: store.phone || '',
        caseCount: caseCountByStore.get(storeId) || store.caseCount || 0,
        score: store.score || 0,
        servicePlanId: plan.id,
        servicePlanName: plan.name,
        priceMode: plan.priceMode,
        minAmount: plan.minAmount,
        maxAmount: plan.maxAmount,
        amount: plan.amount,
      }
    })
    .sort((a, b) => {
      const caseDiff = (b.caseCount || 0) - (a.caseCount || 0)
      if (caseDiff !== 0) return caseDiff
      return (b.score || 0) - (a.score || 0)
    })
    .slice(0, STORE_LIMIT)
}

function buildSeo(item, merged, geoPage, { caseTotal }) {
  const forceNoindex = geoPage?.status === 'noindex'
  const allowIndex = !forceNoindex && caseTotal > 0
  const title =
    merged.seoTitle || `${item.name}价格参考与维修案例_透明汽车维修平台 · 辙见`
  const description =
    merged.seoDescription ||
    merged.aiSummary ||
    `了解${item.name}适用情况、维修流程、参考价格、价格影响因素和真实维修案例，可预约本地辙见门店。`
  return {
    title,
    description,
    canonicalPath: `/service/${item.slug}.html`,
    robots: allowIndex ? 'index,follow' : 'noindex,follow',
    allowIndex,
  }
}

function filterCasesByCity(cases, city) {
  const value = String(city || '').trim()
  if (!value) return cases
  return cases.filter((item) => String(item.city || '').includes(value))
}

async function getServiceItemPagePayload(slug, query = {}) {
  const item = resolveH5ServiceItemBySlug(slug)
  if (!item) {
    const err = new Error('服务项目不存在或未开放')
    err.status = 404
    throw err
  }

  const cityFilter = String(query.city || '').trim()
  const geoPage = await loadGeoOverlayForServiceItem(item)
  const merged = mergeServiceItemWithGeo(item, geoPage, cityFilter)
  const relatedTopics = await listPublishedTopicsForServiceItem(item, { limit: 12 })

  const [{ list: allCases, total: caseTotal }, { list: plans }] = await Promise.all([
    listCases({ serviceItemId: item.serviceItemId }),
    listServices({ serviceItemId: item.serviceItemId }),
  ])

  const filteredCases = filterCasesByCity(allCases, merged.cityFilter)
  const effectiveCases = filteredCases.length ? filteredCases : allCases
  const effectiveCaseTotal = merged.cityFilter ? effectiveCases.length : caseTotal

  const manualCaseIds = Array.isArray(geoPage?.relatedCaseIds) ? geoPage.relatedCaseIds : []
  const featuredSource = manualCaseIds.length
    ? orderCasesByIds(effectiveCases, manualCaseIds, CASE_LIMIT)
    : effectiveCases.slice(0, CASE_LIMIT)
  const featuredCases = featuredSource.map(mapCaseListItem)

  const caseCountByStore = new Map()
  effectiveCases.forEach((c) => {
    if (!c.storeId) return
    caseCountByStore.set(c.storeId, (caseCountByStore.get(c.storeId) || 0) + 1)
  })

  const storeIds = [...new Set(plans.map((p) => p.storeId).filter(Boolean))]
  let merchants = []
  if (storeIds.length) {
    const { list } = await listMerchants({ limit: 100 })
    merchants = list.filter((m) => storeIds.includes(m.id))
  }

  const recommendedStores = buildRecommendedStores(plans, merchants, caseCountByStore)
  const referencePrice = buildCaseReferencePrice(item, effectiveCases)

  const relatedServices = (item.relatedSlugs || [])
    .map((relatedSlug) => resolveH5ServiceItemBySlug(relatedSlug))
    .filter(Boolean)
    .map((related) => ({
      slug: related.slug,
      name: related.name,
      path: `/service/${related.slug}.html`,
    }))

  const aggregated = applyAggregateToServiceContent({
    cases: effectiveCases,
    serviceName: item.name,
    city: merged.cityFilter,
    priceMode: item.priceMode,
    aiSummary: merged.aiSummary,
    faq: [],
  })

  const seo = buildSeo(item, { ...merged, aiSummary: aggregated.aiSummary }, geoPage, {
    caseTotal: effectiveCaseTotal,
  })

  const schemaGraph = buildServicePageSchemaGraph({
    baseUrl: config.publicBaseUrl,
    item: {
      slug: item.slug,
      name: item.name,
      summary: merged.summary,
      aiSummary: aggregated.aiSummary,
      cityFilter: merged.cityFilter,
    },
    seo,
    geo: geoPage
      ? {
          updatedAt: geoPage.updatedAt || '',
          publishedAt: geoPage.publishedAt || '',
        }
      : null,
    faq: [],
    aggregateStats: aggregated.aggregateStats,
    organizationSameAs: config.geo?.organizationSameAs || [],
  })

  return {
    item: {
      slug: item.slug,
      serviceItemId: item.serviceItemId,
      name: item.name,
      priceMode: item.priceMode,
      summary: merged.summary,
      aiSummary: aggregated.aiSummary,
      scenarios: merged.scenarios,
      process: merged.process,
      priceFactors: merged.priceFactors,
      cityFilter: merged.cityFilter,
    },
    geo: geoPage
      ? {
          id: geoPage.id,
          slug: geoPage.slug,
          pageType: geoPage.pageType,
          updatedAt: geoPage.updatedAt || '',
          publishedAt: geoPage.publishedAt || '',
        }
      : null,
    referencePrice,
    featuredCases,
    recommendedStores,
    relatedServices,
    relatedTopics,
    faq: [],
    faqLinks: [],
    articleBody: merged.articleBody || '',
    aggregateStats: aggregated.aggregateStats,
    stats: {
      caseCount: effectiveCaseTotal,
      storeCount: recommendedStores.length,
      sampleSize: aggregated.aggregateStats.sampleSize,
      hasInformationGain: aggregated.aggregateStats.hasInformationGain,
    },
    schemaGraph,
    seo,
  }
}

module.exports = {
  getServiceItemPagePayload,
}
