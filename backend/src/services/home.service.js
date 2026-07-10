const {
  HOME_ACCIDENT_ENTRY,
  HOME_PLATFORM_INTRO,
  HOME_PLATFORM_IDENTITY,
  HOME_PROTECTION_TEXT,
} = require('../constants/home')
const {
  mapHomeServiceEntries,
  buildServiceNavLinks,
  buildCityNavLinks,
} = require('../constants/h5-internal-links')
const { listMerchants, fetchPublicCaseRows } = require('./content.service')
const { listGeoPages } = require('./geo.service')
const { filterIntentDiscoveryTopics } = require('../utils/geo-intent-discovery')
const { resolveClientReadableMediaUrl } = require('../lib/media-storage')

function mapFeaturedCase(item) {
  return {
    id: item.id,
    albumId: item.albumId,
    authorizationTier: item.authorizationTier,
    coverImage: resolveClientReadableMediaUrl(item.coverImage || ''),
    coverImageDesensitized: resolveClientReadableMediaUrl(
      item.coverImageDesensitized || item.coverImage || ''
    ),
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
    coverImage: resolveClientReadableMediaUrl(store.coverImage),
    qualificationTags: store.qualificationTags,
    specialties: store.specialties,
    supportsAlbum: store.supportsAlbum,
  }))
}

async function getHomePayload() {
  const [featuredCases, recommendedMerchants, geoResult] = await Promise.all([
    fetchFeaturedCases(3),
    fetchRecommendedMerchants(6),
    listGeoPages({ limit: 0 }),
  ])

  const geoTopics = filterIntentDiscoveryTopics(geoResult.list || [], { limit: 6 })
  const cityEntries = buildCityNavLinks()

  return {
    cityEntries,
    serviceEntries: mapHomeServiceEntries(),
    serviceNav: buildServiceNavLinks(),
    geoTopics,
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
