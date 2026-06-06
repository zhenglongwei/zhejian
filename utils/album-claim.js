const ALBUM_CLAIM_PAGE = '/pages/album/claim/index'

function buildAlbumClaimPath(albumId) {
  if (!albumId) return ALBUM_CLAIM_PAGE
  return `${ALBUM_CLAIM_PAGE}?albumId=${encodeURIComponent(albumId)}`
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
  resolveAlbumIdFromOptions,
}
