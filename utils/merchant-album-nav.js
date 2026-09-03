const MERCHANT_ALBUM_EDIT_PAGE = '/packageMerchant/pages/album/edit/index'
const MERCHANT_ALBUM_FLOW_PAGE = '/packageMerchant/pages/album/flow/index'
const MERCHANT_ALBUM_INVITE_PAGE = '/packageMerchant/pages/album/invite/index'
const { usesFlowTimeline } = require('./service-flow-display')

function resolveAlbumHasOwner(album = {}) {
  if (album.hasOwner === true) return true
  return (
    Boolean(String(album.userId || '').trim()) ||
    Boolean(String(album.userPhone || '').trim())
  )
}

function resolveMerchantAlbumEditPage(album = {}) {
  return usesFlowTimeline(album) ? MERCHANT_ALBUM_FLOW_PAGE : MERCHANT_ALBUM_EDIT_PAGE
}

function buildMerchantAlbumEntryPath(albumId, album = {}, options = {}) {
  const id = String(albumId || album.albumId || '').trim()
  if (!id) return MERCHANT_ALBUM_FLOW_PAGE
  const page = resolveAlbumHasOwner({ ...album, albumId: id })
    ? resolveMerchantAlbumEditPage({ ...album, albumId: id })
    : MERCHANT_ALBUM_INVITE_PAGE
  const params = [`albumId=${encodeURIComponent(id)}`]
  if (options.stage) params.push(`stage=${encodeURIComponent(String(options.stage))}`)
  if (options.expandFollowUp) params.push('expandFollowUp=1')
  return `${page}?${params.join('&')}`
}

module.exports = {
  MERCHANT_ALBUM_EDIT_PAGE,
  MERCHANT_ALBUM_FLOW_PAGE,
  MERCHANT_ALBUM_INVITE_PAGE,
  resolveAlbumHasOwner,
  resolveMerchantAlbumEditPage,
  buildMerchantAlbumEntryPath,
}
