/**
 * 商家服务相册访问控制（Phase 1 · 禁止仅凭 storeId 跨商家访问）
 */

function canAccessMerchantAlbum(album, merchantId) {
  if (!album || !merchantId) return false
  return String(album.merchantId || '') === String(merchantId)
}

function assertMerchantAlbumAccess(album, merchantId) {
  if (!canAccessMerchantAlbum(album, merchantId)) {
    const err = new Error('档案不存在或已被删除')
    err.status = 404
    throw err
  }
}

/** @deprecated storeId 参数保留兼容，不再参与鉴权 */
function assertMerchantAlbum(album, _storeId, merchantId) {
  assertMerchantAlbumAccess(album, merchantId)
}

module.exports = {
  canAccessMerchantAlbum,
  assertMerchantAlbumAccess,
  assertMerchantAlbum,
}
