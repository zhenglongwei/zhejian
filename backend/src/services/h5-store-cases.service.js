const {
  buildListPageSeo,
  buildStoreCasesPagePath,
} = require('../lib/h5-list-seo')
const { getMerchantDetail, listCases } = require('./content.service')

const DEFAULT_PAGE_SIZE = 12

function extractCityFromStore(store) {
  if (store.city) return String(store.city)
  const addr = store.address || ''
  const m = String(addr).match(/([\u4e00-\u9fa5]{2,4}市)/)
  return m ? m[1] : '杭州'
}

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
    planAmount: item.planAmount,
    minAmount: item.minAmount,
    maxAmount: item.maxAmount,
    authorizationTier: item.authorizationTier,
    publishedAt: item.publishedAt || '',
    city: item.city || '',
  }
}

function buildFilterOptions(allCases) {
  const names = new Set()
  ;(allCases || []).forEach((item) => {
    if (item.serviceName) names.add(item.serviceName)
  })
  return [...names].sort()
}

function buildStoreCasesSeo(store, { total, allowIndex, page, hasFilters, hasMore, serviceName }) {
  const city = extractCityFromStore(store)
  const cityPart = city.replace(/市$/, '')
  const canonicalPath = `/store/${store.id}/cases`
  const listSeo = buildListPageSeo({
    canonicalPath,
    allowIndex,
    page,
    hasFilters,
    hasMore,
    buildPagePath: (opts) =>
      buildStoreCasesPagePath(store.id, {
        page: opts.page,
        serviceName,
      }),
  })

  return {
    title: `${store.name}维修案例_${cityPart}真实汽车维修案例 · 辙见`,
    description: `查看${store.name}已审核、已脱敏的公开维修案例（共 ${total} 条），了解维修项目、价格参考与施工过程摘要。`,
    ...listSeo,
  }
}

async function getStoreCasesPagePayload(storeId, query = {}) {
  const store = await getMerchantDetail(storeId)
  const page = Math.max(1, parseInt(String(query.page || 1), 10) || 1)
  const pageSize = Math.min(
    Math.max(parseInt(String(query.pageSize || DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE, 1),
    50
  )
  const serviceName = query.serviceName ? String(query.serviceName).trim() : ''

  const [{ list, total, hasMore: listHasMore }, { list: allStoreCases }] = await Promise.all([
    listCases({
      storeId,
      page,
      pageSize,
      serviceName: serviceName || undefined,
    }),
    listCases({ storeId }),
  ])

  const allowIndex = total > 0
  const hasFilters = Boolean(serviceName)
  const hasMore = listHasMore != null ? listHasMore : page * pageSize < total
  const city = extractCityFromStore(store)

  return {
    store: {
      id: store.id,
      name: store.name,
      address: store.address,
      businessHours: store.businessHours,
      caseCount: store.caseCount,
      coverImage: store.coverImage,
      status: store.status,
      city,
    },
    cases: list.map(mapCaseListItem),
    filters: {
      serviceNames: buildFilterOptions(allStoreCases),
      activeServiceName: serviceName,
    },
    pagination: {
      page,
      pageSize,
      total,
      hasMore,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
    },
    seo: buildStoreCasesSeo(store, {
      total,
      allowIndex,
      page,
      hasFilters,
      hasMore,
      serviceName,
    }),
  }
}

module.exports = {
  getStoreCasesPagePayload,
  DEFAULT_PAGE_SIZE,
}
