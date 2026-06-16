const { resolveH5ServiceItemBySlug } = require('../constants/h5-service-items')
const { listCases, listMerchants, listServices } = require('./content.service')
const {
  loadGeoOverlayForServiceItem,
  mergeServiceItemWithGeo,
} = require('./h5-service-geo-merge.service')
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

function buildReferencePrice(item, plans) {
  if (item.priceMode === 'accident') {
    return {
      mode: 'accident',
      text: item.referencePriceHint,
      note: '事故车维修不支持线上最终报价，需到店检测或拆检后确认。',
    }
  }

  const amounts = []
  ;(plans || []).forEach((plan) => {
    if (plan.amount != null) amounts.push(Number(plan.amount))
    if (plan.minAmount != null) amounts.push(Number(plan.minAmount))
    if (plan.maxAmount != null) amounts.push(Number(plan.maxAmount))
  })
  const valid = amounts.filter((n) => Number.isFinite(n) && n > 0)

  if (item.priceMode === 'fixed' && valid.length) {
    const min = Math.min(...valid)
    return {
      mode: 'fixed',
      text: '参考价格：¥' + min + ' 起',
      note: item.referencePriceHint,
    }
  }

  if (valid.length) {
    const min = Math.min(...valid)
    const max = Math.max(...valid)
    return {
      mode: 'range',
      text: min === max ? '参考价格：¥' + min : '参考区间：¥' + min + '–¥' + max,
      note: item.referencePriceHint,
    }
  }

  return {
    mode: item.priceMode || 'consult',
    text: item.referencePriceHint || '需到店检测后确认维修方案和费用',
    note: '实际费用以门店检测为准。',
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

function buildSeo(item, merged, { caseTotal, storeTotal }) {
  const allowIndex = caseTotal > 0 || storeTotal > 0
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
  const referencePrice = buildReferencePrice(item, plans)

  const relatedServices = (item.relatedSlugs || [])
    .map((relatedSlug) => resolveH5ServiceItemBySlug(relatedSlug))
    .filter(Boolean)
    .map((related) => ({
      slug: related.slug,
      name: related.name,
      path: `/service/${related.slug}.html`,
    }))

  return {
    item: {
      slug: item.slug,
      serviceItemId: item.serviceItemId,
      name: item.name,
      priceMode: item.priceMode,
      summary: merged.summary,
      aiSummary: merged.aiSummary,
      scenarios: merged.scenarios,
      process: merged.process,
      priceFactors: merged.priceFactors,
      cityFilter: merged.cityFilter,
    },
    referencePrice,
    featuredCases,
    recommendedStores,
    relatedServices,
    faq: merged.faq,
    faqLinks: merged.faqLinks,
    stats: {
      caseCount: effectiveCaseTotal,
      storeCount: recommendedStores.length,
    },
    seo: buildSeo(item, merged, {
      caseTotal: effectiveCaseTotal,
      storeTotal: recommendedStores.length,
    }),
  }
}

module.exports = {
  getServiceItemPagePayload,
}
