/**
 * 城市定位 — MVP 首发杭州，定位仅用于距离展示与服务范围提示
 */
const DEFAULT_CITY = {
  code: 'hangzhou',
  name: '杭州',
  isServiceCity: true,
}

/** 杭州大致矩形范围（gcj02，MVP 够用） */
const HANGZHOU_BOUNDS = {
  minLat: 29.75,
  maxLat: 30.65,
  minLng: 119.72,
  maxLng: 120.55,
}

const STORAGE_OUTSIDE_NOTICE = 'city_outside_notice_v1'
const OUTSIDE_SERVICE_NOTICE = '当前服务暂以杭州为主，你仍可浏览案例和服务信息'

function isInHangzhou(latitude, longitude) {
  if (latitude == null || longitude == null) return false
  return (
    latitude >= HANGZHOU_BOUNDS.minLat &&
    latitude <= HANGZHOU_BOUNDS.maxLat &&
    longitude >= HANGZHOU_BOUNDS.minLng &&
    longitude <= HANGZHOU_BOUNDS.maxLng
  )
}

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

function requestUserLocation() {
  return new Promise((resolve) => {
    wx.getLocation({
      type: 'gcj02',
      success(res) {
        resolve({
          granted: true,
          latitude: res.latitude,
          longitude: res.longitude,
        })
      },
      fail() {
        resolve({ granted: false })
      },
    })
  })
}

/**
 * @returns {Promise<{
 *   city: typeof DEFAULT_CITY,
 *   locationGranted: boolean,
 *   inServiceArea: boolean,
 *   coords: { latitude: number, longitude: number } | null,
 *   outsideNotice: string
 * }>}
 */
async function resolveCityContext() {
  const loc = await requestUserLocation()
  if (!loc.granted) {
    return {
      city: DEFAULT_CITY,
      locationGranted: false,
      inServiceArea: true,
      coords: null,
      outsideNotice: '',
      outsideServiceNotice: '',
    }
  }

  const inServiceArea = isInHangzhou(loc.latitude, loc.longitude)
  let outsideNotice = ''
  if (!inServiceArea) {
    try {
      const shown = wx.getStorageSync(STORAGE_OUTSIDE_NOTICE)
      if (!shown) {
        outsideNotice = OUTSIDE_SERVICE_NOTICE
        wx.setStorageSync(STORAGE_OUTSIDE_NOTICE, 1)
      }
    } catch (e) {
      outsideNotice = OUTSIDE_SERVICE_NOTICE
    }
  }

  return {
    city: DEFAULT_CITY,
    locationGranted: true,
    inServiceArea,
    coords: { latitude: loc.latitude, longitude: loc.longitude },
    outsideNotice,
    outsideServiceNotice: inServiceArea ? '' : OUTSIDE_SERVICE_NOTICE,
  }
}

function enrichStoreWithDistance(store, coords) {
  if (!store || !coords || store.latitude == null || store.longitude == null) {
    return store
  }
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
}

function enrichStoresWithDistance(stores, coords) {
  if (!coords) return stores || []
  return (stores || []).map((store) => enrichStoreWithDistance(store, coords))
}

module.exports = {
  DEFAULT_CITY,
  OUTSIDE_SERVICE_NOTICE,
  resolveCityContext,
  enrichStoresWithDistance,
  formatDistance,
  isInHangzhou,
}
