/**
 * 首页聚合 — D4 mock
 * MOCK: 联调后接 GET /api/user/home
 */
const {
  HOME_SERVICE_ENTRIES,
  HOME_ACCIDENT_ENTRY,
  HOME_PLATFORM_INTRO,
  HOME_PROTECTION_TEXT,
} = require('../constants/home-entries')
const { fetchStoreList } = require('./store')
const { fetchCaseList } = require('./case')

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchHomeData() {
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

  return {
    city,
    serviceEntries,
    accidentEntry: HOME_ACCIDENT_ENTRY,
    recommendedMerchants,
    featuredCases,
    platformIntro: { points: HOME_PLATFORM_INTRO },
    protectionText: HOME_PROTECTION_TEXT,
    moduleErrors: {
      merchants: merchantsError,
      cases: casesError,
    },
  }
}

module.exports = {
  fetchHomeData,
}
