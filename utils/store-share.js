/**
 * 门店公开主页分享（小程序卡片 + H5 站外链）
 * 仅使用已公开展示信息（门头封面、名称、地址等），不含未审核/私密资料
 */
const { ENV } = require('../services/config')

function buildStoreH5Url(storeId) {
  if (!storeId) return ''
  const base = String(ENV.baseUrl || '').replace(/\/$/, '')
  if (!base) return ''
  return `${base}/store/${encodeURIComponent(storeId)}.html`
}

function buildStoreShareTitle(store = {}) {
  const name = (store.name || '').trim() || '汽修门店'
  return `【${name}】维修服务与公开案例 · 辙见`
}

function buildStoreShareImageUrl(store = {}) {
  const cover = (store.coverImage || '').trim()
  if (!cover) return ''
  if (cover.startsWith('https://') || cover.startsWith('http://')) return cover
  const base = String(ENV.baseUrl || '').replace(/\/$/, '')
  if (cover.startsWith('/') && base) return `${base}${cover}`
  return cover
}

function buildMiniProgramSharePath(storeId) {
  return `/pages/store/detail/index?id=${encodeURIComponent(storeId)}`
}

function canShareStore(store = {}) {
  return Boolean(store && store.id && (store.name || '').trim())
}

function buildPublicStoreSharePayload(store = {}) {
  if (!canShareStore(store)) return null
  const payload = {
    title: buildStoreShareTitle(store),
    path: buildMiniProgramSharePath(store.id),
  }
  const imageUrl = buildStoreShareImageUrl(store)
  if (imageUrl) payload.imageUrl = imageUrl
  return payload
}

/** 右上角「分享到朋友圈」单页模式 */
function buildPublicStoreTimelinePayload(store = {}, storeId = '') {
  const id = (store && store.id) || storeId || ''
  const title =
    store && (store.name || '').trim()
      ? buildStoreShareTitle(store)
      : '辙见 · 门店主页'
  const result = {
    title,
    query: id ? `id=${encodeURIComponent(id)}` : '',
  }
  const imageUrl = buildStoreShareImageUrl(store || {})
  if (imageUrl) result.imageUrl = imageUrl
  return result
}

function buildPublicStoreSocialCopy(store = {}, url = '') {
  const name = (store.name || '').trim() || '门店'
  const lines = [
    `辙见门店 · 【${name}】`,
    store.address ? `地址：${store.address}` : '',
    store.businessHours ? `营业时间：${store.businessHours}` : '',
    store.specialties && store.specialties.length
      ? `擅长：${store.specialties.slice(0, 5).join('、')}`
      : '',
    '可查看公开服务方案与脱敏维修案例，修车前可先了解门店能力。',
    '',
    '👉 查看门店主页：',
    url,
    '',
    '注：展示内容由门店自行维护，仅供了解参考，不作平台担保。',
  ].filter((line, index, arr) => {
    if (line !== '') return true
    return index > 0 && arr[index - 1] !== ''
  })
  return lines.join('\n')
}

function copyPublicStoreWebLink(storeId, store = {}) {
  const url = buildStoreH5Url(storeId)
  if (!url) {
    wx.showToast({ title: '门店信息缺失', icon: 'none' })
    return Promise.reject(new Error('missing storeId'))
  }
  const text = buildPublicStoreSocialCopy(store, url)
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showModal({
          title: '分享文案已复制',
          content: '文案与 H5 链接已一并复制，可直接粘贴到抖音、小红书、知乎等社交媒体。',
          showCancel: false,
          confirmText: '知道了',
        })
        resolve(text)
      },
      fail: reject,
    })
  })
}

function copyPublicStoreMiniLink(storeId, store = {}) {
  const path = buildMiniProgramSharePath(storeId)
  if (!path || !storeId) {
    wx.showToast({ title: '门店信息缺失', icon: 'none' })
    return Promise.reject(new Error('missing storeId'))
  }
  const title = buildStoreShareTitle(store)
  const text = `${title}\n\n请在微信中打开小程序查看：\n${path}`
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showModal({
          title: '分享文案已复制',
          content: '请将内容粘贴给好友。对方需在微信中打开小程序查看。',
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
  buildStoreH5Url,
  buildStoreShareTitle,
  buildStoreShareImageUrl,
  buildMiniProgramSharePath,
  canShareStore,
  buildPublicStoreSharePayload,
  buildPublicStoreTimelinePayload,
  buildPublicStoreSocialCopy,
  copyPublicStoreWebLink,
  copyPublicStoreMiniLink,
}
