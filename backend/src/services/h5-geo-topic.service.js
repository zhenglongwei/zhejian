const { getGeoPageDetail } = require('./geo.service')

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
  return {
    title: `${page.title}_本地汽车维修专题 · 辙见`,
    description:
      page.summary ||
      `查看${page.city || ''}${page.title}相关门店、脱敏案例与常见问题，价格仅供参考。`,
    canonicalPath: `/topic/${page.slug}`,
    robots: allowIndex ? 'index,follow' : 'noindex,follow',
    allowIndex,
  }
}

async function getGeoTopicPagePayload(slugOrId) {
  const detail = await getGeoPageDetail(slugOrId)
  const allowIndex = detail.relatedCaseCount > 0 || detail.relatedStoreCount > 0

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
      isAccidentTopic: detail.isAccidentTopic,
      primaryStoreId: detail.primaryStoreId || '',
      relatedServiceId: detail.relatedServiceId || '',
    },
    scenarios: detail.scenarios || [],
    priceFactors: detail.priceFactors || [],
    faq: detail.faq || [],
    relatedCases: (detail.relatedCases || []).map(mapCaseItem),
    relatedStores: (detail.relatedStores || []).map(mapStoreItem),
    primaryStore: detail.primaryStore ? mapStoreItem(detail.primaryStore) : null,
    stats: {
      caseCount: detail.relatedCaseCount,
      storeCount: detail.relatedStoreCount,
    },
    seo: buildTopicSeo(detail, { allowIndex }),
  }
}

module.exports = {
  getGeoTopicPagePayload,
}
