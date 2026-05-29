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
  const title = (detail && (detail.title || detail.serviceName)) || '维修案例'
  return `【${title}】脱敏维修过程参考，修车前值得一看 · 辙见`
}

function buildPublicCaseSocialCopy(detail = {}, url = '') {
  const title = (detail && (detail.title || detail.serviceName)) || '维修案例'
  const storeName =
    (detail && detail.storeName) || (detail && detail.store && detail.store.name) || ''
  const lines = [
    `辙见公开案例 · 【${title}】`,
    storeName
      ? `来自【${storeName}】，车主授权公示的脱敏维修过程。`
      : '车主授权公示的脱敏维修过程，含关键节点与参考信息。',
    '修同款或类似问题前，可以先翻翻流程和内容，做个参考。',
    '',
    '👉 查看案例详情：',
    url,
    '',
    '注：内容为平台已审核的脱敏公示案例，仅供维修过程参考。',
  ]
  return lines.join('\n')
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

function buildPublicCaseSharePayload(detail) {
  if (!detail || !detail.id) return null
  const payload = {
    title: buildCaseShareTitle(detail),
    path: buildMiniProgramSharePath(detail.id),
  }
  const imageUrl = buildCaseShareImageUrl(detail)
  if (imageUrl) payload.imageUrl = imageUrl
  return payload
}

function buildCaseSharePayload(detail) {
  return buildPublicCaseSharePayload(detail)
}

function copyPublicCaseMiniLink(caseId, detail = {}) {
  const path = buildMiniProgramSharePath(caseId)
  if (!path || !caseId) {
    wx.showToast({ title: '案例信息缺失', icon: 'none' })
    return Promise.reject(new Error('missing caseId'))
  }
  const title = buildCaseShareTitle(detail)
  const text = `${title}\n\n请在微信中打开小程序查看：\n${path}`
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showModal({
          title: '分享文案已复制',
          content:
            '请将内容粘贴给好友。对方需在微信中打开小程序查看。',
          showCancel: false,
          confirmText: '知道了',
        })
        resolve(text)
      },
      fail: reject,
    })
  })
}

function copyPublicCaseWebLink(caseId, detail = {}) {
  const url = buildCaseH5Url(caseId)
  if (!url) {
    wx.showToast({ title: '案例信息缺失', icon: 'none' })
    return Promise.reject(new Error('missing caseId'))
  }
  const text = buildPublicCaseSocialCopy(detail, url)
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showModal({
          title: '分享文案已复制',
          content:
            '文案与链接已一并复制，可直接粘贴到抖音、小红书、知乎等社交媒体。',
          showCancel: false,
          confirmText: '知道了',
        })
        resolve(text)
      },
      fail: reject,
    })
  })
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
    serviceName: detail.serviceName || '',
    storeName: (detail.store && detail.store.name) || '',
    coverImage: cover,
    coverImageDesensitized: cover,
    nodes: cover ? [{ images: [cover] }] : [],
  }
}

module.exports = {
  buildCaseH5Url,
  buildCaseShareTitle,
  buildPublicCaseSocialCopy,
  buildCaseShareImageUrl,
  canShareCase,
  buildCaseSharePayload,
  buildPublicCaseSharePayload,
  buildMiniProgramSharePath,
  buildShareableCaseFromAlbum,
  copyCaseShareLink,
  copyPublicCaseMiniLink,
  copyPublicCaseWebLink,
}
