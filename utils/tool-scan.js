const ALBUM_ID_PATTERN = /^alb_[a-zA-Z0-9_]+$/
const { MERCHANT_SHARE_FROM } = require('./share-store-context')

function decodeSafe(value) {
  try {
    return decodeURIComponent(String(value || '').trim())
  } catch (e) {
    return String(value || '').trim()
  }
}

function buildAlbumClaimUrl(albumId) {
  const id = decodeSafe(albumId)
  if (!id) return ''
  return `/pages/album/claim/index?albumId=${encodeURIComponent(id)}`
}

function buildAlbumDetailUrl(albumId) {
  const id = decodeSafe(albumId)
  if (!id) return ''
  return `/pages/album/detail/index?albumId=${encodeURIComponent(id)}&from=${MERCHANT_SHARE_FROM}`
}

function buildStoreDetailUrl(storeId) {
  const id = decodeSafe(storeId)
  if (!id) return ''
  return `/pages/store/detail/index?id=${encodeURIComponent(id)}&from=${MERCHANT_SHARE_FROM}`
}

/**
 * 从扫码/粘贴内容解析小程序内路径（含 query）
 * @param {string} raw
 * @returns {string}
 */
function resolveScanTargetPath(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''

  const albumQuery = text.match(/[?&]albumId=([^&#\s]+)/i)
  if (albumQuery) {
    return buildAlbumClaimUrl(albumQuery[1])
  }

  const storeQuery = text.match(/[?&](?:storeId|id)=([^&#\s]+)/i)
  if (storeQuery && /store\/detail/i.test(text)) {
    return buildStoreDetailUrl(storeQuery[1])
  }

  if (/^\/pages\//.test(text) || /^pages\//.test(text)) {
    return text.startsWith('/') ? text : `/${text}`
  }

  if (/^pages\//.test(text.replace(/^\//, ''))) {
    return text.startsWith('/') ? text : `/${text}`
  }

  try {
    const url = new URL(text)
    const albumFromUrl = url.searchParams.get('albumId')
    if (albumFromUrl) {
      if (/album\/detail/i.test(url.pathname)) {
        return buildAlbumDetailUrl(albumFromUrl)
      }
      return buildAlbumClaimUrl(albumFromUrl)
    }
    const storeFromUrl = url.searchParams.get('id') || url.searchParams.get('storeId')
    if (storeFromUrl && /store/i.test(url.pathname)) {
      return buildStoreDetailUrl(storeFromUrl)
    }
  } catch (e) {
    // 非 URL，继续兜底
  }

  if (ALBUM_ID_PATTERN.test(text)) {
    return buildAlbumClaimUrl(text)
  }

  return ''
}

function navigateToScanTarget(raw) {
  const url = resolveScanTargetPath(raw)
  if (!url) {
    wx.showToast({ title: '无法识别该二维码', icon: 'none' })
    return false
  }
  wx.navigateTo({
    url,
    fail: () => {
      wx.showToast({ title: '无法打开链接', icon: 'none' })
    },
  })
  return true
}

function navigateFromAlbumCode(code) {
  const albumId = decodeSafe(code)
  if (!albumId) {
    wx.showToast({ title: '请输入相册码', icon: 'none' })
    return false
  }
  if (!ALBUM_ID_PATTERN.test(albumId)) {
    wx.showToast({ title: '相册码格式不正确', icon: 'none' })
    return false
  }
  wx.navigateTo({ url: buildAlbumClaimUrl(albumId) })
  return true
}

module.exports = {
  resolveScanTargetPath,
  navigateToScanTarget,
  navigateFromAlbumCode,
  buildAlbumClaimUrl,
}
