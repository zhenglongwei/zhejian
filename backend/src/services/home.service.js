const {
  HOME_SERVICE_ENTRIES,
  HOME_ACCIDENT_ENTRY,
  HOME_PLATFORM_INTRO,
  HOME_PLATFORM_IDENTITY,
  HOME_PROTECTION_TEXT,
} = require('../constants/home')
const { listServiceCities } = require('../constants/cities')
const { listMerchants, fetchPublicCaseRows } = require('./content.service')

function mapFeaturedCase(item) {
  return {
    id: item.id,
    albumId: item.albumId,
    authorizationTier: item.authorizationTier,
    coverImage: item.coverImage || '',
    coverImageDesensitized: item.coverImageDesensitized || item.coverImage || '',
    title: item.title,
    serviceName: item.serviceName,
    summary: item.summary,
    priceMode: item.priceMode || 'range',
    amount: item.amount,
    planAmount: item.planAmount,
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
    latitude: store.latitude,
    longitude: store.longitude,
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

  const cityEntries = listServiceCities().map((city) => ({
    slug: city.slug,
    name: city.name,
    path: `/city/${city.slug}`,
  }))

  return {
    cityEntries,
    serviceEntries,
    accidentEntry: HOME_ACCIDENT_ENTRY,
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
