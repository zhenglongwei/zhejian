function toRadians(deg) {
  return (deg * Math.PI) / 180
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const earthRadius = 6378137
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadius * c
}

function formatDistance(meters) {
  if (meters == null || Number.isNaN(meters)) return ''
  if (meters < 1000) return `${Math.max(1, Math.round(meters))}m`
  return `${(meters / 1000).toFixed(1)}km`
}

function enrichStoresWithDistance(stores, coords) {
  if (!coords || coords.latitude == null || coords.longitude == null) {
    return stores || []
  }
  return (stores || []).map((store) => {
    if (store.latitude == null || store.longitude == null) return store
    const meters = distanceMeters(
      coords.latitude,
      coords.longitude,
      store.latitude,
      store.longitude
    )
    return {
      ...store,
      distanceMeters: meters,
      distanceText: formatDistance(meters),
    }
  })
}

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
      const { CATEGORY_CASE_KEYWORDS } = require('../constants/search-filters')
      const keywords = CATEGORY_CASE_KEYWORDS[filters.categoryId] || []
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

function parseSearchCoords(query = {}) {
  const lat = query.userLat != null ? Number(query.userLat) : null
  const lng = query.userLng != null ? Number(query.userLng) : null
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null
  }
  return { latitude: lat, longitude: lng }
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
  parseSearchCoords,
  prepareSearchLists,
  enrichStoresWithDistance,
}
