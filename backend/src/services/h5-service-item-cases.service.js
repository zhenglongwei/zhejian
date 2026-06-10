const { resolveH5ServiceItemBySlug } = require('../constants/h5-service-items')
const { listCases } = require('./content.service')

const DEFAULT_PAGE_SIZE = 12

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
    storeId: item.storeId,
    storeName: item.storeName,
    city: item.city || '',
    publishedAt: item.publishedAt || '',
  }
}

function buildFilterOptions(allCases) {
  const cities = new Set()
  const stores = new Map()
  ;(allCases || []).forEach((item) => {
    if (item.city) cities.add(item.city)
    if (item.storeId && item.storeName) {
      stores.set(item.storeId, item.storeName)
    }
  })
  return {
    cities: [...cities].sort(),
    stores: [...stores.entries()].map(([id, name]) => ({ id, name })),
  }
}

function buildServiceItemCasesSeo(item, { total, allowIndex }) {
  return {
    title: `${item.name}维修案例_真实汽车维修案例列表 · 辙见`,
    description: `查看${item.name}已审核、已脱敏的公开维修案例（共 ${total} 条），了解维修流程、价格参考与门店信息。`,
    canonicalPath: `/service/${item.slug}/cases`,
    robots: allowIndex ? 'index,follow' : 'noindex,follow',
    allowIndex,
  }
}

async function getServiceItemCasesPagePayload(slug, query = {}) {
  const item = resolveH5ServiceItemBySlug(slug)
  if (!item) {
    const err = new Error('服务项目不存在或未开放')
    err.status = 404
    throw err
  }

  const page = Math.max(1, parseInt(String(query.page || 1), 10) || 1)
  const pageSize = Math.min(
    Math.max(parseInt(String(query.pageSize || DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE, 1),
    50
  )
  const city = query.city ? String(query.city).trim() : ''
  const storeId = query.storeId ? String(query.storeId).trim() : ''

  const baseQuery = { serviceItemId: item.serviceItemId }
  const [{ list, total, hasMore }, { list: allCases }] = await Promise.all([
    listCases({
      ...baseQuery,
      page,
      pageSize,
      city: city || undefined,
      storeId: storeId || undefined,
    }),
    listCases(baseQuery),
  ])

  const allowIndex = total > 0
  const filterOptions = buildFilterOptions(allCases)

  return {
    item: {
      slug: item.slug,
      serviceItemId: item.serviceItemId,
      name: item.name,
      summary: item.summary,
      priceMode: item.priceMode,
    },
    cases: list.map(mapCaseListItem),
    filters: {
      cities: filterOptions.cities,
      stores: filterOptions.stores,
      activeCity: city,
      activeStoreId: storeId,
    },
    faq: item.faq || [],
    pagination: {
      page,
      pageSize,
      total,
      hasMore: hasMore != null ? hasMore : page * pageSize < total,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
    },
    seo: buildServiceItemCasesSeo(item, { total, allowIndex }),
  }
}

module.exports = {
  getServiceItemCasesPagePayload,
  DEFAULT_PAGE_SIZE,
}
