const { resolveCityBySlug } = require('../constants/cities')
const {
  HOME_SERVICE_ENTRIES,
  HOME_ACCIDENT_ENTRY,
  HOME_PLATFORM_INTRO,
  HOME_PROTECTION_TEXT,
} = require('../constants/home')
const {
  SERVICE_ENTRY_H5_LINKS,
} = require('../constants/h5-internal-links')
const { listCases, listMerchants } = require('./content.service')
const { listGeoPages } = require('./geo.service')
const { filterIntentDiscoveryTopics } = require('../utils/geo-intent-discovery')

function mapFeaturedCase(item) {
  return {
    id: item.id,
    slug: item.slug || (item.seo && item.seo.slug) || '',
    albumId: item.albumId,
    authorizationTier: item.authorizationTier,
    coverImage: item.coverImage || '',
    coverImageDesensitized: item.coverImageDesensitized || item.coverImage || '',
    title: item.title,
    serviceName: item.serviceName,
    summary: item.summary,
    priceMode: item.priceMode || 'range',
    storeId: item.storeId,
    storeName: item.storeName,
    city: item.city || '杭州',
  }
}

function matchesCity(record, cityName) {
  if (!record || !cityName) return false
  if (record.city && record.city === cityName) return true
  if (record.address && String(record.address).includes(cityName)) return true
  return false
}

function buildCitySeo(city, { storeCount, caseCount }) {
  const allowIndex = storeCount > 0 && (caseCount > 0 || storeCount >= 1)
  return {
    title: `${city.name}汽车维修保养_${city.name}汽修门店与维修案例 · 辙见`,
    description: `查看${city.name}汽车维修保养门店、真实维修案例、透明度说明和常见维修问题。公开案例已脱敏审核，价格仅供参考，实际费用以门店检测为准。`,
    canonicalPath: `/city/${city.slug}`,
    robots: allowIndex ? 'index,follow' : 'noindex,follow',
    allowIndex,
  }
}

function mapServiceEntries(entries) {
  return entries
    .filter((e) => e.status === 'enabled')
    .sort((a, b) => a.sort - b.sort)
    .map((entry) => ({
      ...entry,
      h5Path: SERVICE_ENTRY_H5_LINKS[entry.id] || '/case/',
    }))
}

async function getCityPagePayload(citySlug) {
  const city = resolveCityBySlug(citySlug)
  if (!city) {
    const err = new Error('城市不存在或未开通')
    err.status = 404
    throw err
  }
  if (!city.isServiceCity) {
    const err = new Error('该城市暂未开通服务')
    err.status = 404
    throw err
  }

  const [{ list: allCases }, { list: allMerchants }, geoResult] = await Promise.all([
    listCases({ limit: 100 }),
    listMerchants({ limit: 100 }),
    listGeoPages({ limit: 0 }),
  ])

  const cityCases = allCases.filter((item) => matchesCity(item, city.name))
  const cityMerchants = allMerchants.filter((item) => matchesCity(item, city.name))
  const cityGeoTopics = filterIntentDiscoveryTopics(geoResult.list || [], { limit: 6 }).filter(
    (item) => item.city === city.name
  )

  const featuredCases = cityCases.slice(0, 6).map(mapFeaturedCase)
  const recommendedMerchants = cityMerchants.slice(0, 6)
  const storeCount = cityMerchants.length
  const caseCount = cityCases.length

  return {
    city: {
      slug: city.slug,
      code: city.code,
      name: city.name,
      isServiceCity: city.isServiceCity,
    },
    serviceEntries: mapServiceEntries(HOME_SERVICE_ENTRIES),
    accidentEntry: HOME_ACCIDENT_ENTRY,
    geoTopics: cityGeoTopics,
    recommendedMerchants,
    featuredCases,
    platformIntro: { points: HOME_PLATFORM_INTRO },
    protectionText: HOME_PROTECTION_TEXT,
    priceNotice:
      '案例价格仅为参考区间，复杂维修与事故车需到店检测后确认，实际费用以门店为准。',
    stats: {
      caseCount,
      storeCount,
    },
    seo: buildCitySeo(city, { storeCount, caseCount }),
  }
}

module.exports = {
  getCityPagePayload,
  SERVICE_ENTRY_H5_LINKS,
}
