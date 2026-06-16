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

async function getGeoTopicPagePayload(slugOrId) {
  const detail = await getGeoPageDetail(slugOrId)
  const catalogStats = detail.catalogStats || {}
  const caseCount = detail.isServiceBase
    ? catalogStats.caseTotal ?? detail.relatedCaseCount
    : detail.relatedCaseCount
  const storeCount = detail.isServiceBase
    ? catalogStats.storeTotal ?? detail.relatedStoreCount
    : detail.relatedStoreCount
  const allowIndex = caseCount > 0 || storeCount > 0

  const serviceMeta = detail.serviceMeta || {}

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
      aiSummary: detail.aiSummary || detail.summary || '',
      isAccidentTopic: detail.isAccidentTopic,
      isServiceBase: detail.isServiceBase,
      serviceItemId: detail.serviceItemId || '',
      displayName: serviceMeta.displayName || detail.title,
      priceMode: serviceMeta.priceMode || 'range',
      primaryStoreId: detail.primaryStoreId || '',
      relatedServiceId: detail.relatedServiceId || '',
    },
    process: serviceMeta.process || [],
    referencePrice: detail.referencePrice || null,
    relatedTopics: detail.relatedTopics || [],
    scenarios: detail.scenarios || [],
    priceFactors: detail.priceFactors || [],
    faq: detail.faq || [],
    faqLinks: detail.faqLinks || [],
    relatedCases: (detail.relatedCases || []).map(mapCaseItem),
    relatedStores: (detail.relatedStores || []).map(mapStoreItem),
    primaryStore: detail.primaryStore ? mapStoreItem(detail.primaryStore) : null,
    stats: {
      caseCount,
      storeCount,
    },
    seo: buildTopicSeo(detail, { allowIndex }),
  }
}

module.exports = {
  getGeoTopicPagePayload,
}
