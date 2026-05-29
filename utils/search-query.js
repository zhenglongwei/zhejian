/**
 * 搜索筛选 / 排序 — 前后端共用逻辑（小程序 mock 路径）
 */
const { enrichStoresWithDistance } = require('./city-location')

function applySearchFilters(list, tab, filters = {}) {
  let next = (list || []).slice()

  if (tab === 'service') {
    if (filters.categoryId) {
      next = next.filter((item) => item.categoryId === filters.categoryId)
    }
    if (filters.accidentCapable) {
      next = next.filter((item) => item.priceMode === 'accident')
    }
  }

  if (tab === 'merchant') {
    if (filters.supportAlbum) {
      next = next.filter((item) => item.supportsAlbum)
    }
    if (filters.openNow) {
      next = next.filter((item) => item.status === 'open')
    }
    if (filters.accidentCapable) {
      next = next.filter((item) =>
        (item.specialties || []).some((tag) => String(tag).includes('事故'))
      )
    }
    const maxKm = Number(filters.maxDistanceKm)
    if (maxKm > 0) {
      const maxMeters = maxKm * 1000
      next = next.filter(
        (item) =>
          item.distanceMeters != null && item.distanceMeters <= maxMeters
      )
    }
  }

  if (tab === 'case') {
    if (filters.authorizationTier) {
      next = next.filter(
        (item) => item.authorizationTier === filters.authorizationTier
      )
    }
    if (filters.categoryId) {
      const { getCategoryCaseKeywords } = require('../constants/search-filters')
      const keywords = getCategoryCaseKeywords(filters.categoryId)
      if (keywords.length) {
        next = next.filter((item) => {
          const name = item.serviceName || ''
          return keywords.some((kw) => name.includes(kw))
        })
      }
    }
  }

  return next
}

function sortSearchList(list, tab, sortKey, coords) {
  let next = (list || []).slice()

  if (tab === 'service') {
    if (sortKey === 'price_asc') {
      next.sort(
        (a, b) => (a.amount || a.minAmount || 0) - (b.amount || b.minAmount || 0)
      )
    } else if (sortKey === 'price_desc') {
      next.sort(
        (a, b) => (b.amount || b.maxAmount || 0) - (a.amount || a.maxAmount || 0)
      )
    }
    return next
  }

  if (tab === 'merchant') {
    if (coords) {
      next = enrichStoresWithDistance(next, coords)
    }
    if (sortKey === 'distance' && coords) {
      next.sort((a, b) => {
        const da = a.distanceMeters != null ? a.distanceMeters : Number.MAX_SAFE_INTEGER
        const db = b.distanceMeters != null ? b.distanceMeters : Number.MAX_SAFE_INTEGER
        return da - db
      })
    } else if (sortKey === 'case_count') {
      next.sort((a, b) => (b.caseCount || 0) - (a.caseCount || 0))
    }
    return next
  }

  if (tab === 'case') {
    if (sortKey === 'latest') {
      next.sort((a, b) =>
        String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''))
      )
    }
  }

  return next
}

function prepareSearchLists({ tab, sort, filters, coords, services, merchants, cases }) {
  let serviceList = services || []
  let merchantList = merchants || []
  let caseList = cases || []

  serviceList = applySearchFilters(
    sortSearchList(serviceList, 'service', sort, coords),
    'service',
    filters
  )
  merchantList = applySearchFilters(
    sortSearchList(merchantList, 'merchant', sort, coords),
    'merchant',
    filters
  )
  caseList = applySearchFilters(
    sortSearchList(caseList, 'case', sort, coords),
    'case',
    filters
  )

  const tabMap = { service: serviceList, merchant: merchantList, case: caseList }
  return {
    serviceList,
    merchantList,
    caseList,
    activeList: tabMap[tab] || serviceList,
  }
}

module.exports = {
  applySearchFilters,
  sortSearchList,
  prepareSearchLists,
}
