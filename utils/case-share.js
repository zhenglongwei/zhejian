/**
 * 平台公开案例分享（案例 Tab / H5 公示页）
 * 私人分享见 utils/album-owner-share.js
 */
const { ENV } = require('../services/config')
const { pickCaseDisplayCover, isDesensitizedUrl } = require('./desensitize-url')

function buildCaseH5Url(caseId) {
  if (!caseId) return ''
  const base = String(ENV.baseUrl || '').replace(/\/$/, '')
  if (!base) return ''
  return `${base}/case/view.html?id=${encodeURIComponent(caseId)}`
}

function buildCaseShareTitle(detail) {
  if (!detail || !detail.title) return '辙见 · 已脱敏公开案例'
  return `${detail.title} · 已脱敏公开案例`
}

function buildCaseShareImageUrl(detail) {
  const cover = pickCaseDisplayCover(detail)
  if (!cover || !isDesensitizedUrl(cover)) return ''
  if (cover.startsWith('https://') || cover.startsWith('http://')) return cover
  const base = String(ENV.baseUrl || '').replace(/\/$/, '')
  if (cover.startsWith('/') && base) return `${base}${cover}`
  return cover
}

function canShareCase(detail) {
  return Boolean(detail && detail.id && buildCaseShareImageUrl(detail))
}

function buildMiniProgramSharePath(caseId) {
  return `/pages/case/detail/index?id=${caseId}`
}

function buildCaseSharePayload(detail) {
  if (!canShareCase(detail)) return null
  const payload = {
    title: buildCaseShareTitle(detail),
    path: buildMiniProgramSharePath(detail.id),
  }
  const imageUrl = buildCaseShareImageUrl(detail)
  if (imageUrl) payload.imageUrl = imageUrl
  return payload
}

function copyCaseShareLink(caseId, detail) {
  if (detail && !canShareCase(detail)) {
    wx.showToast({ title: '案例脱敏内容未就绪，暂不可分享', icon: 'none' })
    return Promise.reject(new Error('case not shareable'))
  }
  const url = buildCaseH5Url(caseId)
  if (!url) {
    wx.showToast({ title: '案例信息缺失', icon: 'none' })
    return Promise.reject(new Error('missing caseId'))
  }
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showModal({
          title: '网页链接已复制',
          content:
            '可在浏览器或微信聊天中粘贴打开。\n\n请勿使用右上角「复制链接」——那是小程序专用短链（#小程序://…），浏览器无法打开。',
          showCancel: false,
          confirmText: '知道了',
        })
        resolve(url)
      },
      fail: reject,
    })
  })
}

function buildShareableCaseFromAlbum(detail) {
  if (!detail || !detail.publicCaseId) return null
  const cover = detail.publicCaseCover || ''
  return {
    id: detail.publicCaseId,
    title: detail.publicCaseTitle || detail.serviceName || '公开案例',
    coverImage: cover,
    coverImageDesensitized: cover,
    nodes: cover ? [{ images: [cover] }] : [],
  }
}

module.exports = {
  buildCaseH5Url,
  buildCaseShareTitle,
  buildCaseShareImageUrl,
  canShareCase,
  buildCaseSharePayload,
  buildMiniProgramSharePath,
  buildShareableCaseFromAlbum,
  copyCaseShareLink,
}
