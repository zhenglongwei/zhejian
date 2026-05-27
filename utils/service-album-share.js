const OWNER_SHARE_QUERY = 'from=merchant_share'

function buildOwnerSharePath(albumId) {
  if (!albumId) return '/pages/index/index'
  return `/pages/album/detail/index?albumId=${albumId}&${OWNER_SHARE_QUERY}`
}

function canShareToOwner(detail = {}) {
  const phone = String(detail.userPhone || '').trim()
  return Boolean(detail.albumId && /^1\d{10}$/.test(phone))
}

function buildOwnerShareMessage(detail = {}) {
  if (!canShareToOwner(detail)) return null
  const storeName = detail.storeName || '门店'
  return {
    title: `${storeName} · 您的服务相册`,
    path: buildOwnerSharePath(detail.albumId),
  }
}

module.exports = {
  buildOwnerSharePath,
  canShareToOwner,
  buildOwnerShareMessage,
}
