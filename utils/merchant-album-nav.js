const MERCHANT_ALBUM_FLOW_PAGE = '/packageMerchant/pages/album/flow/index'
const MERCHANT_ALBUM_INVITE_PAGE = '/packageMerchant/pages/album/invite/index'

function resolveAlbumHasOwner(album = {}) {
  if (album.hasOwner === true) return true
  return (
    Boolean(String(album.userId || '').trim()) ||
    Boolean(String(album.userPhone || '').trim())
  )
}

/** 商家进相册作业：只进 DOC-FLOW 进度页（旧四阶段 edit 已废止） */
function resolveMerchantAlbumEditPage() {
  return MERCHANT_ALBUM_FLOW_PAGE
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
  MERCHANT_ALBUM_FLOW_PAGE,
  MERCHANT_ALBUM_INVITE_PAGE,
  resolveAlbumHasOwner,
  resolveMerchantAlbumEditPage,
  buildMerchantAlbumEntryPath,
}
