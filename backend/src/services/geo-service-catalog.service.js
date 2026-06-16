/**
 * GEO-TOPIC · 标准服务（原 /service/）并入专题后的案例/门店/参考价聚合
 */
const { listCases, listMerchants, listServices } = require('./content.service')
const { resolveH5ServiceItemBySlug, resolveH5ServiceItemById } = require('../constants/h5-service-items')

const CASE_LIMIT = 12
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
    viewCount: item.viewCount || 0,
  }
}

function mapStoreListItem(item) {
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

function buildReferencePrice(meta, plans) {
  const priceMode = meta.priceMode || 'range'
  if (priceMode === 'accident') {
    return {
      mode: 'accident',
      text: meta.referencePriceHint || '需到店检测后确认方案和费用',
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

  if (priceMode === 'fixed' && valid.length) {
    const min = Math.min(...valid)
    return {
      mode: 'fixed',
      text: '参考价格：¥' + min + ' 起',
      note: meta.referencePriceHint || '',
    }
  }

  if (valid.length) {
    const min = Math.min(...valid)
    const max = Math.max(...valid)
    return {
      mode: 'range',
      text: min === max ? '参考价格：¥' + min : '参考区间：¥' + min + '–¥' + max,
      note: meta.referencePriceHint || '',
    }
  }

  return {
    mode: priceMode || 'consult',
    text: meta.referencePriceHint || '需到店检测后确认维修方案和费用',
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
    .map(([storeId]) => {
      const store = merchantMap.get(storeId)
      return mapStoreListItem({
        ...store,
        caseCount: caseCountByStore.get(storeId) || store.caseCount || 0,
      })
    })
    .sort((a, b) => (b.caseCount || 0) - (a.caseCount || 0))
    .slice(0, STORE_LIMIT)
}

/**
 * @param {{ serviceItemId?: string, priceMode?: string, referencePriceHint?: string, relatedSlugs?: string[], displayName?: string, process?: string[] }} serviceMeta
 */
async function aggregateServiceCatalog(serviceMeta = {}) {
  const serviceItemId = String(serviceMeta.serviceItemId || '').trim()
  if (!serviceItemId) {
    return {
      relatedCases: [],
      relatedStores: [],
      referencePrice: null,
      relatedTopics: [],
      caseTotal: 0,
      storeTotal: 0,
    }
  }

  const [{ list: allCases, total: caseTotal }, { list: plans }] = await Promise.all([
    listCases({ serviceItemId }),
    listServices({ serviceItemId }),
  ])

  const caseCountByStore = new Map()
  allCases.forEach((c) => {
    if (!c.storeId) return
    caseCountByStore.set(c.storeId, (caseCountByStore.get(c.storeId) || 0) + 1)
  })

  const storeIds = [...new Set(plans.map((p) => p.storeId).filter(Boolean))]
  let merchants = []
  if (storeIds.length) {
    const { list } = await listMerchants({ limit: 100 })
    merchants = list.filter((m) => storeIds.includes(m.id))
  }

  const relatedTopics = (serviceMeta.relatedSlugs || [])
    .map((slug) => resolveH5ServiceItemBySlug(slug))
    .filter(Boolean)
    .map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      path: `/topic/${entry.slug}`,
    }))

  const relatedStores = buildRecommendedStores(plans, merchants, caseCountByStore)
  const relatedCases = allCases.slice(0, CASE_LIMIT).map(mapCaseListItem)

  return {
    relatedCases,
    relatedStores,
    referencePrice: buildReferencePrice(serviceMeta, plans),
    relatedTopics,
    caseTotal,
    storeTotal: relatedStores.length,
  }
}

/**
 * 将 H5 服务目录常量转为 geo_pages 行形状（未入库时的 fallback）
 */
function buildCatalogGeoPageFromItem(item) {
  if (!item) return null
  return {
    id: `geop_svc_${item.slug}`,
    slug: item.slug,
    title: `${item.name}价格参考与维修案例`,
    summary: item.summary || '',
    coverImage: '',
    pageType: 'service_base',
    city: '',
    serviceId: item.serviceItemId,
    faultTag: '',
    vehicleSeries: '',
    keywords: [item.name],
    scenarios: item.scenarios || [],
    priceFactors: item.priceFactors || [],
    faq: item.faq || [],
    faqLinks: [],
    relatedCaseIds: [],
    relatedStoreIds: [],
    primaryStoreId: '',
    relatedServiceId: item.serviceItemId,
    seoTitle: `${item.name}价格参考与维修案例_透明汽车维修平台 · 辙见`,
    seoDescription: `了解${item.name}适用情况、维修流程、参考价格、价格影响因素和真实维修案例，可预约本地辙见门店。`,
    aiSummary: item.summary || '',
    serviceMeta: {
      serviceItemId: item.serviceItemId,
      displayName: item.name,
      priceMode: item.priceMode || 'range',
      referencePriceHint: item.referencePriceHint || '',
      process: item.process || [],
      relatedSlugs: item.relatedSlugs || [],
    },
    status: 'published',
    publishedAt: '',
    updatedAt: '',
    createdAt: '',
  }
}

function resolveCatalogGeoPageBySlug(slug) {
  const item = resolveH5ServiceItemBySlug(slug)
  return buildCatalogGeoPageFromItem(item)
}

function resolveServiceItemIdFromPage(page) {
  if (!page) return ''
  const meta = page.serviceMeta || {}
  return (
    meta.serviceItemId ||
    page.serviceId ||
    page.relatedServiceId ||
    ''
  )
}

module.exports = {
  aggregateServiceCatalog,
  buildCatalogGeoPageFromItem,
  resolveCatalogGeoPageBySlug,
  resolveServiceItemIdFromPage,
  resolveH5ServiceItemById,
  mapCaseListItem,
  mapStoreListItem,
}
