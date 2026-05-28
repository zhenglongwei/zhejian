const {
  HOME_SERVICE_ENTRIES,
  HOME_ACCIDENT_ENTRY,
  HOME_PLATFORM_INTRO,
  HOME_PLATFORM_IDENTITY,
  HOME_PROTECTION_TEXT,
  HOME_GEO_TOPICS,
} = require('../constants/home')
const { listMerchants, fetchPublicCaseRows } = require('./content.service')

function mapFeaturedCase(item) {
  return {
    id: item.id,
    albumId: item.albumId,
    authorizationTier: item.authorizationTier,
    coverImage: item.coverImage || '',
    title: item.title,
    serviceName: item.serviceName,
    summary: item.summary,
    priceMode: item.priceMode || 'range',
    minAmount: item.minAmount,
    maxAmount: item.maxAmount,
    storeId: item.storeId,
    storeName: item.storeName,
    city: item.city || '杭州',
    viewCount: item.viewCount || 0,
  }
}

async function fetchFeaturedCases(limit = 3) {
  const rows = await fetchPublicCaseRows()
  return rows.slice(0, limit).map(mapFeaturedCase)
}

async function fetchRecommendedMerchants(limit = 6) {
  const { list } = await listMerchants({ limit })
  return list.map((store) => ({
    id: store.id,
    name: store.name,
    status: store.status,
    address: store.address,
    businessHours: store.businessHours,
    caseCount: store.caseCount,
    coverImage: store.coverImage,
    qualificationTags: store.qualificationTags,
    specialties: store.specialties,
    supportsAlbum: store.supportsAlbum,
  }))
}

async function getHomePayload() {
  const [featuredCases, recommendedMerchants] = await Promise.all([
    fetchFeaturedCases(3),
    fetchRecommendedMerchants(6),
  ])

  const serviceEntries = HOME_SERVICE_ENTRIES.filter((e) => e.status === 'enabled').sort(
    (a, b) => a.sort - b.sort
  )

  return {
    city: {
      code: 'hangzhou',
      name: '杭州',
      isServiceCity: true,
    },
    serviceEntries,
    accidentEntry: HOME_ACCIDENT_ENTRY,
    geoTopics: HOME_GEO_TOPICS,
    recommendedMerchants,
    featuredCases,
    platformIntro: { points: HOME_PLATFORM_INTRO },
    platformIdentity: HOME_PLATFORM_IDENTITY,
    protectionText: HOME_PROTECTION_TEXT,
  }
}

module.exports = {
  getHomePayload,
}
