/**
 * 首页聚合 — mock / GET /api/user/home
 */
const { ENV } = require('./config')
const { get } = require('./request')
const {
  HOME_SERVICE_ENTRIES,
  HOME_ACCIDENT_ENTRY,
  HOME_PLATFORM_INTRO,
  HOME_PLATFORM_IDENTITY,
  HOME_PROTECTION_TEXT,
} = require('../constants/home-entries')
const { fetchStoreList } = require('./store')
const { fetchCaseList } = require('./case')
const { fetchGeoHomeEntries } = require('./geo')

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchHomeDataMock() {
  await delay()

  const city = {
    code: 'hangzhou',
    name: '杭州',
    isServiceCity: true,
  }

  const serviceEntries = HOME_SERVICE_ENTRIES.filter(
    (e) => e.status === 'enabled'
  ).sort((a, b) => a.sort - b.sort)

  let recommendedMerchants = []
  let merchantsError = false
  try {
    const { list } = await fetchStoreList({ limit: 3, status: 'open' })
    recommendedMerchants = list
  } catch (e) {
    merchantsError = true
    recommendedMerchants = []
  }

  let featuredCases = []
  let casesError = false
  try {
    const { list } = await fetchCaseList({ limit: 3 })
    featuredCases = list
  } catch (e) {
    casesError = true
    featuredCases = []
  }

  let geoTopics = []
  try {
    geoTopics = await fetchGeoHomeEntries(6)
  } catch (e) {
    geoTopics = []
  }

  return {
    city,
    serviceEntries,
    accidentEntry: HOME_ACCIDENT_ENTRY,
    recommendedMerchants,
    featuredCases,
    geoTopics,
    platformIntro: { points: HOME_PLATFORM_INTRO },
    platformIdentity: HOME_PLATFORM_IDENTITY,
    protectionText: HOME_PROTECTION_TEXT,
    moduleErrors: {
      merchants: merchantsError,
      cases: casesError,
    },
  }
}

function normalizeHomeResponse(data) {
  if (!data || typeof data !== 'object') return data
  return {
    city: data.city,
    serviceEntries: data.serviceEntries || data.service_entries || [],
    accidentEntry: data.accidentEntry || data.accident_entry || null,
    recommendedMerchants:
      data.recommendedMerchants || data.recommended_merchants || [],
    featuredCases: data.featuredCases || data.featured_cases || [],
    geoTopics: data.geoTopics || data.geo_topics || [],
    platformIntro: data.platformIntro || data.platform_intro || { points: [] },
    platformIdentity: data.platformIdentity || data.platform_identity || '',
    protectionText: data.protectionText || data.protection_text || '',
    moduleErrors: data.moduleErrors || data.module_errors || {},
  }
}

async function fetchHomeData() {
  if (ENV.mode === 'mock') {
    return fetchHomeDataMock()
  }
  const data = await get('/user/home')
  return normalizeHomeResponse(data)
}

module.exports = {
  fetchHomeData,
}
