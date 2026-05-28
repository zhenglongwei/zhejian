/**
 * 搜索 — mock + API
 * prod/dev: GET /api/user/search/*
 */
const { ENV } = require('./config')
const { get } = require('./request')
const { HOTWORDS } = require('../mock/search')
const { GEO_PAGES } = require('../mock/geo-pages')
const { DEFAULT_CITY } = require('../constants/search-filters')
const { SUGGEST_TYPE_LABEL } = require('../constants/search')
const { fetchServiceList } = require('./service')
const { fetchStoreList } = require('./store')
const { fetchCaseList } = require('./case')

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

function sortServices(list, sortKey) {
  const next = list.slice()
  if (sortKey === 'price_asc') {
    next.sort((a, b) => (a.amount || a.minAmount || 0) - (b.amount || b.minAmount || 0))
  } else if (sortKey === 'price_desc') {
    next.sort((a, b) => (b.amount || b.maxAmount || 0) - (a.amount || a.maxAmount || 0))
  }
  return next
}

function sortMerchants(list, sortKey) {
  const next = list.slice()
  if (sortKey === 'case_count') {
    next.sort((a, b) => (b.caseCount || 0) - (a.caseCount || 0))
  }
  return next
}

function sortCases(list, sortKey) {
  const next = list.slice()
  if (sortKey === 'latest') {
    next.sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
  }
  return next
}

function applyFilters(list, tab, filters = {}) {
  let next = list.slice()
  if (tab === 'merchant') {
    if (filters.supportAlbum) {
      next = next.filter((item) => item.supportsAlbum)
    }
    if (filters.accidentCapable) {
      next = next.filter((item) =>
        (item.specialties || []).some((tag) => String(tag).includes('事故'))
      )
    }
  }
  if (tab === 'service' && filters.accidentCapable) {
    next = next.filter((item) => item.priceMode === 'accident')
  }
  return next
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

  const filteredServices = services.filter((item) =>
    matchRecord(item, k, ['name', 'summary', 'categoryName'])
  )
  const filteredMerchants = merchants.filter((item) =>
    matchRecord(item, k, ['name', 'address', 'specialties'])
  )
  const filteredCases = cases.filter((item) =>
    matchRecord(item, k, ['title', 'summary', 'serviceName', 'vehicleText'])
  )
  const geoPages = filterGeoPages(k)

  return buildSuggestItems(k, filteredServices, filteredMerchants, filteredCases, geoPages)
}

async function searchContent(query = {}) {
  if (ENV.mode !== 'mock') {
    const params = { ...query }
    if (params.filters && typeof params.filters === 'object') {
      params.filters = JSON.stringify(params.filters)
    }
    return get('/user/search', params)
  }
  await delay()
  const keyword = normalizeKeyword(query.keyword)
  const tab = query.tab || 'service'
  const sort = query.sort || 'relevance'
  const filters = query.filters || {}
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.max(1, Number(query.pageSize) || 20)

  const [{ list: services }, { list: merchants }, { list: cases }] = await Promise.all([
    fetchServiceList(),
    fetchStoreList(),
    fetchCaseList(),
  ])

  let serviceList = services.filter((item) =>
    matchRecord(item, keyword, ['name', 'summary', 'categoryName', 'storeName'])
  )
  let merchantList = merchants.filter((item) =>
    matchRecord(item, keyword, ['name', 'address', 'specialties'])
  )
  let caseList = cases.filter((item) =>
    matchRecord(item, keyword, ['title', 'summary', 'serviceName', 'vehicleText', 'storeName'])
  )
  const geoPages = filterGeoPages(keyword)

  serviceList = applyFilters(sortServices(serviceList, sort), 'service', filters)
  merchantList = applyFilters(sortMerchants(merchantList, sort), 'merchant', filters)
  caseList = applyFilters(sortCases(caseList, sort), 'case', filters)

  const tabMap = {
    service: serviceList,
    merchant: merchantList,
    case: caseList,
  }
  const activeList = tabMap[tab] || serviceList
  const start = (page - 1) * pageSize
  const pagedList = activeList.slice(start, start + pageSize)

  return {
    keyword,
    tab,
    sort,
    filters,
    geoPages,
    services: tab === 'service' ? pagedList : serviceList.slice(0, pageSize),
    merchants: tab === 'merchant' ? pagedList : merchantList.slice(0, pageSize),
    cases: tab === 'case' ? pagedList : caseList.slice(0, pageSize),
    list: pagedList,
    total: activeList.length,
    hasMore: start + pageSize < activeList.length,
    counts: {
      service: serviceList.length,
      merchant: merchantList.length,
      case: caseList.length,
      geo: geoPages.length,
    },
    hotwords: HOTWORDS,
  }
}

module.exports = {
  fetchSearchConfig,
  fetchSearchSuggest,
  searchContent,
}
