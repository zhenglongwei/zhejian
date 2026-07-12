const ALBUM_CLAIM_PAGE = '/pages/album/claim/index'

function buildAlbumClaimPath(albumId) {
  if (!albumId) return ALBUM_CLAIM_PAGE
  return `${ALBUM_CLAIM_PAGE}?albumId=${encodeURIComponent(albumId)}`
}

function buildAlbumClaimShareMessage(detail = {}) {
  const albumId = String(detail.albumId || '').trim()
  const storeName = detail.storeName || '门店'
  const serviceName = String(detail.serviceName || '').trim()
  const title = serviceName
    ? `${storeName} · 请确认关联${serviceName}`
    : `${storeName} · 请确认关联服务相册`
  return {
    title,
    path: buildAlbumClaimPath(albumId),
  }
}

function resolveAlbumIdFromOptions(options = {}) {
  let albumId = options.albumId || options.id || ''
  if (!albumId && options.scene) {
    try {
      albumId = decodeURIComponent(options.scene)
    } catch (e) {
      albumId = options.scene
    }
  }
  return String(albumId || '').trim()
}

module.exports = {
  ALBUM_CLAIM_PAGE,
  buildAlbumClaimPath,
  buildAlbumClaimShareMessage,
  resolveAlbumIdFromOptions,
}
