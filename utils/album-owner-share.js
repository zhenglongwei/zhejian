/**
 * 用户自主分享（私人传播，与授权公示 / 平台公开案例解耦）
 */
const { ENV } = require('../services/config')
const { SHARE_MODE, SHARE_CHANNEL } = require('../constants/album-share')
const { SERVICE_ALBUM_REPAIR_DONE_STATUSES } = require('../constants/service-album-status')
const {
  buildDesensitizedUrl,
  resolveImageSrc,
  isDesensitizedUrl,
} = require('./desensitize-url')

function canOwnerShareAlbum(detail = {}) {
  if (!detail || !detail.albumId) return false
  if (!SERVICE_ALBUM_REPAIR_DONE_STATUSES.includes(detail.status)) return false
  return (detail.imageCount || 0) > 0
}

function buildShareTitle(detail = {}) {
  const serviceName = detail.serviceName || '服务维修'
  const imageCount = Number(detail.imageCount) || 0
  const countHint = imageCount > 0 ? `${imageCount}张过程图` : '全过程实拍'
  return `【${serviceName}】${countHint}，修车前值得一看 · 辙见`
}

function buildOwnerShareSocialCopy(detail = {}, url = '') {
  const title = buildShareTitle(detail)
  if (!url) return title
  return `${title}\n${url}`
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

const { TOOL_HOME_PATH } = require('./share-store-context')

function buildShareMiniPath(token) {
  if (!token) return TOOL_HOME_PATH
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

function buildShareLinkText(detail, token) {
  const path = buildShareMiniPath(token)
  const title = buildShareTitle(detail)
  return `${title}\n\n请在微信中打开小程序查看：\n${path}`
}

function copyOwnerShareLink(token, detail = {}) {
  const text = buildShareLinkText(detail, token)
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showModal({
          title: '分享文案已复制',
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

function buildOwnerShareH5Url(token) {
  if (!token) return ''
  const base = String(ENV.baseUrl || '').replace(/\/$/, '')
  if (!base) return ''
  return `${base}/album/share.html?token=${encodeURIComponent(token)}`
}

function copyOwnerShareH5Link(token, detail = {}, options = {}) {
  const url = buildOwnerShareH5Url(token)
  if (!url) {
    wx.showToast({ title: '分享链接尚未就绪', icon: 'none' })
    return Promise.reject(new Error('missing token'))
  }
  const text = buildOwnerShareSocialCopy(detail, url)
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showModal({
          title: '相册链接已复制',
          content: '发给朋友可打开脱敏后的维修相册。不会自动进店页。',
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
  buildOwnerShareSocialCopy,
  mapNodesForSharePreview,
  pickShareCoverImage,
  buildShareMiniPath,
  buildOwnerShareH5Url,
  buildOwnerSharePayload,
  buildShareLinkText,
  copyOwnerShareLink,
  copyOwnerShareH5Link,
  SHARE_MODE,
  SHARE_CHANNEL,
}
