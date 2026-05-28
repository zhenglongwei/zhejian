/**
 * 公开案例分享（小程序卡片 + H5 链接）
 * 仅允许分享已脱敏、已审核的公开内容，禁止诱导奖励文案。
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
        wx.showToast({
          title: '已复制脱敏案例链接',
          icon: 'success',
        })
        resolve(url)
      },
      fail: reject,
    })
  })
}

module.exports = {
  buildCaseH5Url,
  buildCaseShareTitle,
  buildCaseShareImageUrl,
  canShareCase,
  buildCaseSharePayload,
  buildMiniProgramSharePath,
  copyCaseShareLink,
}
