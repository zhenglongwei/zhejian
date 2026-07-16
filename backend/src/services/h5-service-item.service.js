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

const OFFER_LIMIT = 30

function toFiniteNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function haversineKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null
  const toRad = (d) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10
}

function resolvePlanSortPrice(plan) {
  if (plan.priceMode === 'accident' || plan.priceMode === 'consult') return null
  const amount = toFiniteNumber(plan.amount)
  if (amount != null && amount > 0) return amount
  const min = toFiniteNumber(plan.minAmount)
  if (min != null && min > 0) return min
  const max = toFiniteNumber(plan.maxAmount)
  if (max != null && max > 0) return max
  return null
}

function buildPlanPriceText(plan) {
  if (plan.priceMode === 'accident') return '到店检测后报价'
  if (plan.priceMode === 'consult') return '到店检测后确认'
  if (plan.amount != null) return `¥${plan.amount}`
  if (plan.minAmount != null && plan.maxAmount != null) {
    return plan.minAmount === plan.maxAmount
      ? `¥${plan.minAmount}`
      : `¥${plan.minAmount}–¥${plan.maxAmount}`
  }
  if (plan.minAmount != null) return `¥${plan.minAmount} 起`
  return '到店确认'
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
    note: `基于全平台 ${price.sampleSize} 条脱敏案例汇总，仅供参考。进店后可查看该店方案价与本店案例。`,
  }
}

/**
 * 一项服务 = 一家门店的一条在售方案（比价列表行）
 */
function buildServiceOffers(plans, merchants, casesByStore, geo = {}) {
  const merchantMap = new Map((merchants || []).map((m) => [m.id, m]))
  const byStore = new Map()

  ;(plans || []).forEach((plan) => {
    if (!merchantMap.has(plan.storeId)) return
    const existing = byStore.get(plan.storeId)
    if (!existing) {
      byStore.set(plan.storeId, plan)
      return
    }
    const existingPrice = resolvePlanSortPrice(existing) ?? Infinity
    const planPrice = resolvePlanSortPrice(plan) ?? Infinity
    if (planPrice < existingPrice) byStore.set(plan.storeId, plan)
  })

  const userLat = toFiniteNumber(geo.lat)
  const userLng = toFiniteNumber(geo.lng)

  return [...byStore.entries()]
    .map(([storeId, plan]) => {
      const store = merchantMap.get(storeId)
      const storeCases = casesByStore.get(storeId) || []
      const sortPrice = resolvePlanSortPrice(plan)
      const transparencyScore = toFiniteNumber(store.score) || 0
      const distanceKm = haversineKm(userLat, userLng, store.latitude, store.longitude)
      return {
        id: plan.id,
        servicePlanId: plan.id,
        servicePlanName: plan.name || plan.serviceName || '',
        planPath: `/service/${plan.id}.html`,
        storeId: store.id,
        storeName: store.name,
        storePath: `/store/${store.id}.html`,
        address: store.address || '',
        city: store.city || '',
        phone: store.phone || '',
        businessHours: store.businessHours || '',
        latitude: store.latitude,
        longitude: store.longitude,
        distanceKm,
        priceMode: plan.priceMode,
        minAmount: plan.minAmount,
        maxAmount: plan.maxAmount,
        amount: plan.amount,
        priceText: buildPlanPriceText(plan),
        sortPrice,
        caseCount: storeCases.length,
        transparencyScore,
        // V2.0 无交易评价：用透明度分代替「口碑」指标，供排序与展示
        metrics: {
          price: sortPrice,
          distanceKm,
          caseCount: storeCases.length,
          transparencyScore,
        },
      }
    })
    .sort((a, b) => {
      const caseDiff = (b.caseCount || 0) - (a.caseCount || 0)
      if (caseDiff !== 0) return caseDiff
      const scoreDiff = (b.transparencyScore || 0) - (a.transparencyScore || 0)
      if (scoreDiff !== 0) return scoreDiff
      const priceA = a.sortPrice == null ? Infinity : a.sortPrice
      const priceB = b.sortPrice == null ? Infinity : b.sortPrice
      if (priceA !== priceB) return priceA - priceB
      const distA = a.distanceKm == null ? Infinity : a.distanceKm
      const distB = b.distanceKm == null ? Infinity : b.distanceKm
      return distA - distB
    })
    .slice(0, OFFER_LIMIT)
}

function buildSeo(item, merged, geoPage, { caseTotal, offerCount }) {
  const forceNoindex = geoPage?.status === 'noindex'
  const allowIndex = !forceNoindex && (caseTotal > 0 || offerCount > 0)
  const title =
    merged.seoTitle || `${item.name}门店服务对比与价格参考_透明汽车维修平台 · 辙见`
  const description =
    merged.seoDescription ||
    merged.aiSummary ||
    `对比可提供${item.name}的门店服务方案：参考价格、本店案例数、透明度等，选择后进入该店服务详情。`
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

  const serviceOffers = buildServiceOffers(plans, merchants, casesByStore, {
    lat: query.lat,
    lng: query.lng,
  })
  const referencePrice = buildCaseReferencePrice(
    item,
    effectiveCases.length ? effectiveCases : allCases
  )

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
    offerCount: serviceOffers.length,
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
    /** 比价列表：每家店一项真实服务方案 */
    serviceOffers,
    /** 兼容旧前端字段名 */
    recommendedStores: serviceOffers.map((offer) => ({
      id: offer.storeId,
      name: offer.storeName,
      address: offer.address,
      servicePlanId: offer.servicePlanId,
      planPath: offer.planPath,
      priceMode: offer.priceMode,
      minAmount: offer.minAmount,
      maxAmount: offer.maxAmount,
      amount: offer.amount,
      caseCount: offer.caseCount,
      score: offer.transparencyScore,
      cases: [],
    })),
    featuredCases: [],
    preferredLanding: null,
    relatedServices,
    relatedTopics,
    sortOptions: [
      { value: 'recommend', label: '综合推荐' },
      { value: 'price', label: '价格优先' },
      { value: 'cases', label: '案例更多' },
      { value: 'transparency', label: '透明度更高' },
      { value: 'distance', label: '距离更近' },
    ],
    faq: [],
    faqLinks: [],
    articleBody: '',
    aggregateStats: aggregated.aggregateStats,
    stats: {
      caseCount: effectiveCaseTotal || caseTotal,
      storeCount: serviceOffers.length,
      offerCount: serviceOffers.length,
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
