/**
 * 门店距离计算（纯函数）
 * 小程序不再调用 wx.getLocation；距离展示仅在调用方显式传入坐标时生效（如 H5）。
 */

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
  enrichStoresWithDistance,
  formatDistance,
}
