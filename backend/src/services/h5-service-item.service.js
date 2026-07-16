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

const STORE_LIMIT = 8
const STORE_CASE_LIMIT = 3

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
    note: `基于全平台 ${price.sampleSize} 条脱敏案例汇总，仅供参考；进店后可查看该店方案价与本店案例。`,
  }
}

function buildRecommendedStores(plans, merchants, casesByStore) {
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
      const storeCases = (casesByStore.get(storeId) || []).map(mapCaseListItem)
      return {
        id: store.id,
        name: store.name,
        address: store.address,
        businessHours: store.businessHours,
        phone: store.phone || '',
        city: store.city || '',
        caseCount: storeCases.length,
        score: store.score || 0,
        servicePlanId: plan.id,
        servicePlanName: plan.name || plan.serviceName || '',
        planPath: plan.id ? `/service/${plan.id}.html` : `/store/${store.id}.html`,
        priceMode: plan.priceMode,
        minAmount: plan.minAmount,
        maxAmount: plan.maxAmount,
        amount: plan.amount,
        cases: storeCases.slice(0, STORE_CASE_LIMIT),
      }
    })
    .sort((a, b) => {
      const caseDiff = (b.caseCount || 0) - (a.caseCount || 0)
      if (caseDiff !== 0) return caseDiff
      return (b.score || 0) - (a.score || 0)
    })
    .slice(0, STORE_LIMIT)
}

function buildPreferredLanding(stores, { cityFilter }) {
  if (!stores || stores.length !== 1) return null
  const store = stores[0]
  if (!store.servicePlanId || !store.planPath) return null
  return {
    path: store.planPath,
    storeId: store.id,
    storeName: store.name,
    servicePlanId: store.servicePlanId,
    reason: cityFilter ? 'city_single_store' : 'single_store',
    autoRedirect: Boolean(cityFilter),
  }
}

function buildSeo(item, merged, geoPage, { caseTotal, storeCount }) {
  const forceNoindex = geoPage?.status === 'noindex'
  const allowIndex = !forceNoindex && (caseTotal > 0 || storeCount > 0)
  const title =
    merged.seoTitle || `${item.name}门店服务与价格参考_透明汽车维修平台 · 辙见`
  const description =
    merged.seoDescription ||
    merged.aiSummary ||
    `查看可提供${item.name}的真实门店服务方案、本店案例与全平台价格参考，预约到店检测。`
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

function filterPlansByCity(plans, merchants, city) {
  const value = String(city || '').trim()
  if (!value) return plans
  const cityStoreIds = new Set(
    (merchants || [])
      .filter((m) => String(m.city || m.address || '').includes(value))
      .map((m) => m.id)
  )
  return (plans || []).filter((plan) => cityStoreIds.has(plan.storeId))
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

  const [{ list: allCases, total: caseTotal }, { list: allPlans }, { list: allMerchants }] =
    await Promise.all([
      listCases({ serviceItemId: item.serviceItemId }),
      listServices({ serviceItemId: item.serviceItemId }),
      listMerchants({ limit: 100 }),
    ])

  const storeIds = [...new Set(allPlans.map((p) => p.storeId).filter(Boolean))]
  const merchants = allMerchants.filter((m) => storeIds.includes(m.id))
  const plans = filterPlansByCity(allPlans, merchants, merged.cityFilter)

  const filteredCases = filterCasesByCity(allCases, merged.cityFilter)
  const effectiveCases = filteredCases.length ? filteredCases : cityFilter ? [] : allCases
  const effectiveCaseTotal = effectiveCases.length

  const casesByStore = new Map()
  effectiveCases.forEach((c) => {
    if (!c.storeId) return
    if (!casesByStore.has(c.storeId)) casesByStore.set(c.storeId, [])
    casesByStore.get(c.storeId).push(c)
  })

  const recommendedStores = buildRecommendedStores(plans, merchants, casesByStore)
  const preferredLanding = buildPreferredLanding(recommendedStores, {
    cityFilter: merged.cityFilter,
  })
  const referencePrice = buildCaseReferencePrice(item, effectiveCases.length ? effectiveCases : allCases)

  const relatedServices = (item.relatedSlugs || [])
    .map((relatedSlug) => resolveH5ServiceItemBySlug(relatedSlug))
    .filter(Boolean)
    .map((related) => ({
      slug: related.slug,
      name: related.name,
      path: `/service/${related.slug}.html`,
    }))

  const aggregated = applyAggregateToServiceContent({
    cases: effectiveCases.length ? effectiveCases : allCases,
    serviceName: item.name,
    city: merged.cityFilter,
    priceMode: item.priceMode,
    aiSummary: merged.aiSummary,
    faq: [],
  })

  const seo = buildSeo(item, { ...merged, aiSummary: aggregated.aiSummary }, geoPage, {
    caseTotal: effectiveCaseTotal || caseTotal,
    storeCount: recommendedStores.length,
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
    featuredCases: [],
    recommendedStores,
    preferredLanding,
    relatedServices,
    relatedTopics,
    faq: [],
    faqLinks: [],
    articleBody: merged.articleBody || '',
    aggregateStats: aggregated.aggregateStats,
    stats: {
      caseCount: effectiveCaseTotal || caseTotal,
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
