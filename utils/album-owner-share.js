/**
 * 用户自主分享（私人传播，与授权公示 / 平台公开案例解耦）
 */
const { ENV } = require('../services/config')
const {
  SHARE_MODE,
  SHARE_CHANNEL,
  OWNER_SHARE_TITLE_SUFFIX,
} = require('../constants/album-share')
const { SERVICE_ALBUM_STATUS } = require('../constants/service-album-status')
const {
  buildDesensitizedUrl,
  resolveImageSrc,
  isDesensitizedUrl,
} = require('./desensitize-url')

function canOwnerShareAlbum(detail = {}) {
  if (!detail || !detail.albumId) return false
  if (detail.status !== SERVICE_ALBUM_STATUS.COMPLETED) return false
  return (detail.imageCount || 0) > 0
}

function buildShareTitle(detail = {}) {
  const serviceName = detail.serviceName || '服务相册'
  return `这次${serviceName}的过程记录，可参考查看${OWNER_SHARE_TITLE_SUFFIX}`
}

function mapNodesForSharePreview(detail, mode) {
  const albumId = detail.albumId || detail.id || ''
  return (detail.nodes || []).map((node) => {
    const nodeId = node.id || node.nodeId || ''
    const rawImages = node.images || []
    if (mode === SHARE_MODE.ORIGINAL) {
      return {
        ...node,
        images: rawImages.map(resolveImageSrc).filter(Boolean),
      }
    }
    const desensitized = []
    ;(node.imagesDesensitized || []).forEach((url) => {
      if (isDesensitizedUrl(url)) desensitized.push(url)
    })
    rawImages.forEach((url, idx) => {
      if (isDesensitizedUrl(url)) {
        desensitized.push(url)
        return
      }
      desensitized.push(buildDesensitizedUrl(url, albumId, nodeId, idx))
    })
    return {
      ...node,
      images: desensitized.map(resolveImageSrc).filter(Boolean),
    }
  })
}

function pickShareCoverImage(detail, mode) {
  const nodes = mapNodesForSharePreview(detail, mode)
  for (const node of nodes) {
    for (const url of node.images || []) {
      if (url) return url
    }
  }
  return ''
}

function buildShareMiniPath(token) {
  if (!token) return '/pages/album/list/index'
  return `/pages/album/share/index?token=${encodeURIComponent(token)}`
}

function buildOwnerSharePayload(detail, options = {}) {
  const { shareToken, mode = SHARE_MODE.DESENSITIZED } = options
  if (!shareToken || !canOwnerShareAlbum(detail)) return null

  const payload = {
    title: buildShareTitle(detail),
    path: buildShareMiniPath(shareToken),
  }
  const cover = pickShareCoverImage(detail, mode)
  if (cover && (mode === SHARE_MODE.ORIGINAL || isDesensitizedUrl(cover))) {
    payload.imageUrl = cover
  }
  return payload
}

function buildShareLinkText(token) {
  const path = buildShareMiniPath(token)
  return `辙见服务相册分享\n请在微信中打开小程序并访问：\n${path}`
}

function copyOwnerShareLink(token) {
  const text = buildShareLinkText(token)
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showModal({
          title: '分享说明已复制',
          content:
            '请将内容粘贴给好友。对方需在微信中打开小程序查看。\n\n私人分享不会自动进入案例 Tab 或公开网页。',
          showCancel: false,
          confirmText: '知道了',
        })
        resolve(text)
      },
      fail: reject,
    })
  })
}

module.exports = {
  canOwnerShareAlbum,
  buildShareTitle,
  mapNodesForSharePreview,
  pickShareCoverImage,
  buildShareMiniPath,
  buildOwnerSharePayload,
  buildShareLinkText,
  copyOwnerShareLink,
  SHARE_MODE,
  SHARE_CHANNEL,
}
