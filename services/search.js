/**
 * 搜索 — mock + API
 * prod/dev: GET /api/user/search/*
 */
const { ENV } = require('./config')
const { get, post, request } = require('./request')
const { HOTWORDS } = require('../mock/search')
const { GEO_PAGES } = require('../mock/geo-pages')
const { DEFAULT_CITY } = require('../constants/search-filters')
const { SUGGEST_TYPE_LABEL } = require('../constants/search')
const { fetchServiceList } = require('./service')
const { fetchStoreList } = require('./store')
const { fetchCaseList } = require('./case')
const { prepareSearchLists, packSearchResults } = require('../utils/search-query')
const {
  matchSearchService,
  matchSearchMerchant,
  matchSearchCase,
} = require('../utils/search-match')

function delay(ms = 240) {
  return new Promise((r) => setTimeout(r, ms))
}

function normalizeKeyword(keyword) {
  return String(keyword || '').trim()
}

function includesKeyword(text, keyword) {
  if (!keyword) return true
  return String(text || '')
    .toLowerCase()
    .includes(keyword.toLowerCase())
}

function matchRecord(record, keyword, fields) {
  const k = normalizeKeyword(keyword)
  if (!k) return true
  return fields.some((field) => includesKeyword(record[field], k))
}

function filterGeoPages(keyword) {
  const k = normalizeKeyword(keyword)
  if (!k) return []
  return GEO_PAGES.filter((page) => {
    const haystack = [page.title, page.summary, ...(page.keywords || [])].join(' ')
    return includesKeyword(haystack, k)
  }).map((page) => {
    const slug = page.slug || page.id
    return {
      id: page.id,
      slug,
      title: page.title,
      summary: page.summary,
      updatedAt: page.updatedAt,
      h5Path: '',
    }
  })
}

function buildSuggestItems(keyword, services, merchants, cases, geoPages) {
  const k = normalizeKeyword(keyword)
  if (!k) return []

  const items = []

  services.slice(0, 3).forEach((item) => {
    items.push({
      keyword: item.name,
      type: 'service',
      typeLabel: SUGGEST_TYPE_LABEL.service,
      targetId: item.id,
    })
  })

  merchants.slice(0, 2).forEach((item) => {
    items.push({
      keyword: item.name,
      type: 'merchant',
      typeLabel: SUGGEST_TYPE_LABEL.merchant,
      targetId: item.id,
    })
  })

  cases.slice(0, 2).forEach((item) => {
    items.push({
      keyword: item.title,
      type: 'case',
      typeLabel: SUGGEST_TYPE_LABEL.case,
      targetId: item.id,
    })
  })

  geoPages.slice(0, 2).forEach((item) => {
    items.push({
      keyword: item.title,
      type: 'geo',
      typeLabel: SUGGEST_TYPE_LABEL.geo,
      targetId: item.id,
    })
  })

  return items.slice(0, 8)
}

function parseCoords(query = {}) {
  const lat = query.userLat != null ? Number(query.userLat) : null
  const lng = query.userLng != null ? Number(query.userLng) : null
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null
  }
  return { latitude: lat, longitude: lng }
}

async function fetchSearchConfig() {
  if (ENV.mode !== 'mock') {
    return get('/user/search/config')
  }
  await delay()
  return {
    city: DEFAULT_CITY,
    hotwords: HOTWORDS,
  }
}

async function fetchSearchSuggest(keyword) {
  if (ENV.mode !== 'mock') {
    return get('/user/search/suggest', { keyword })
  }
  await delay(160)
  const k = normalizeKeyword(keyword)
  if (!k) return []

  const [{ list: services }, { list: merchants }, { list: cases }] = await Promise.all([
    fetchServiceList(),
    fetchStoreList(),
    fetchCaseList(),
  ])

  const filteredServices = services.filter((item) => matchSearchService(item, k))
  const filteredMerchants = merchants.filter((item) => matchSearchMerchant(item, k))
  const filteredCases = cases.filter((item) => matchSearchCase(item, k))
  const geoPages = filterGeoPages(k)

  return buildSuggestItems(k, filteredServices, filteredMerchants, filteredCases, geoPages)
}

async function fetchSearchHistory() {
  if (ENV.mode !== 'mock') {
    return get('/user/search/history')
  }
  await delay(120)
  const { SEARCH_HISTORY_KEY } = require('../constants/search')
  let list = []
  try {
    list = wx.getStorageSync(SEARCH_HISTORY_KEY)
    if (!Array.isArray(list)) list = []
  } catch (e) {
    list = []
  }
  return { keywords: list, list: list.map((keyword) => ({ keyword })) }
}

async function postSearchHistory(keyword) {
  if (ENV.mode !== 'mock') {
    return post('/user/search/history', { keyword })
  }
  await delay(80)
  const { SEARCH_HISTORY_KEY, SEARCH_HISTORY_MAX } = require('../constants/search')
  const value = normalizeKeyword(keyword)
  let list = []
  try {
    list = wx.getStorageSync(SEARCH_HISTORY_KEY)
    if (!Array.isArray(list)) list = []
  } catch (e) {
    list = []
  }
  const next = [value, ...list.filter((item) => item !== value)].slice(0, SEARCH_HISTORY_MAX)
  wx.setStorageSync(SEARCH_HISTORY_KEY, next)
  return { keywords: next, list: next.map((item) => ({ keyword: item })) }
}

async function clearRemoteSearchHistory() {
  if (ENV.mode !== 'mock') {
    return request({ url: '/user/search/history', method: 'DELETE' })
  }
  await delay(80)
  return { keywords: [], list: [] }
}

async function searchContent(query = {}) {
  if (ENV.mode !== 'mock') {
    const params = { ...query }
    if (params.filters && typeof params.filters === 'object') {
      params.filters = JSON.stringify(params.filters)
    }
    if (params.coords && params.coords.latitude != null) {
      params.userLat = params.coords.latitude
      params.userLng = params.coords.longitude
      delete params.coords
    }
    return get('/user/search', params)
  }
  await delay()
  const keyword = normalizeKeyword(query.keyword)
  const tab = query.tab || 'all'
  const sort = query.sort || 'relevance'
  const filters = query.filters || {}
  const coords = parseCoords(query.coords ? { userLat: query.coords.latitude, userLng: query.coords.longitude } : query)
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.max(1, Number(query.pageSize) || 20)

  const [{ list: services }, { list: merchants }, { list: cases }] = await Promise.all([
    fetchServiceList(),
    fetchStoreList(),
    fetchCaseList(),
  ])

  const storeId = query.storeId ? String(query.storeId).trim() : ''

  let matchedServices = services.filter((item) => matchSearchService(item, keyword))
  let matchedMerchants = merchants.filter((item) => matchSearchMerchant(item, keyword))
  let matchedCases = cases.filter((item) => matchSearchCase(item, keyword))
  let geoPages = filterGeoPages(keyword)

  if (storeId) {
    matchedServices = matchedServices.filter((item) => item.storeId === storeId)
    matchedMerchants = matchedMerchants.filter((item) => item.id === storeId)
    matchedCases = matchedCases.filter((item) => item.storeId === storeId)
    geoPages = []
  }

  const { serviceList, merchantList, caseList, activeList } = prepareSearchLists({
    tab,
    sort,
    filters,
    coords,
    services: matchedServices,
    merchants: matchedMerchants,
    cases: matchedCases,
  })

  const packed = packSearchResults({
    tab,
    page,
    pageSize,
    serviceList,
    merchantList,
    caseList,
    activeList,
    geoPages,
  })

  return {
    keyword,
    tab,
    sort,
    filters,
    ...packed,
    hotwords: HOTWORDS,
  }
}

module.exports = {
  fetchSearchConfig,
  fetchSearchSuggest,
  fetchSearchHistory,
  postSearchHistory,
  clearRemoteSearchHistory,
  searchContent,
}
