const AUTH_URL = '/packageMerchant/pages/onboarding/index?mode=auth'
const PROFILE_URL = '/packageMerchant/pages/store/edit/index?section=basic'

function hostAlbumUrl(albumId, mode) {
  const id = encodeURIComponent(String(albumId || ''))
  const extra = mode ? `&mode=${encodeURIComponent(mode)}` : ''
  return `/packageMerchant/pages/album/host/index?albumId=${id}${extra}`
}

function isListedOffHost({ hosted, hostVisibility, onPublicWeb }) {
  return Boolean(hosted && hostVisibility === 'public' && onPublicWeb === false)
}

function buildHostPublicGatePrompt({
  publicGate,
  hosted = false,
  hostVisibility = 'private',
  onPublicWeb,
} = {}) {
  if (!publicGate || publicGate.ready) return null
  const listedOff = isListedOffHost({ hosted, hostVisibility, onPublicWeb })
  if (listedOff) {
    return {
      kind: 'listedOff',
      title: '网站上看不到',
      content: publicGate.message || '认证或门店资料不齐，档案暂时不会出现在网站上。',
      confirmText: publicGate.actionLabel || '去处理',
      cancelText: '去看档案',
      action: publicGate.action || '',
      privateMode: false,
      openHost: true,
    }
  }
  if (hosted) return null
  return {
    kind: 'incomplete',
    title: publicGate.title || '先补资料',
    content: publicGate.message || '认证和门店资料齐了，档案才能出现在网站上。',
    confirmText: publicGate.actionLabel || '去补',
    cancelText: '先仅私密',
    action: publicGate.action || '',
    privateMode: true,
    openHost: false,
  }
}

function buildPublicPathBlockedPrompt(publicGate) {
  if (!publicGate || publicGate.ready) return null
  return {
    title: publicGate.title || '先补资料',
    content: publicGate.message || '认证和门店资料齐了，档案才能出现在网站上。',
    confirmText: publicGate.actionLabel || '去补',
    cancelText: '知道了',
    action: publicGate.action || '',
  }
}

function promptPublicPathBlocked(publicGate) {
  const prompt = buildPublicPathBlockedPrompt(publicGate)
  if (!prompt) return false
  if (!prompt.action) {
    wx.showModal({
      title: prompt.title,
      content: prompt.content,
      showCancel: false,
      confirmText: '知道了',
    })
    return true
  }
  wx.showModal({
    title: prompt.title,
    content: prompt.content,
    confirmText: prompt.confirmText,
    cancelText: prompt.cancelText,
    success: (res) => {
      if (res.confirm) navigatePublicGateAction(prompt.action)
    },
  })
  return true
}

function navigatePublicGateAction(action) {
  if (action === 'profile') {
    wx.navigateTo({ url: PROFILE_URL })
    return
  }
  if (action === 'auth') {
    wx.navigateTo({ url: AUTH_URL })
  }
}

function openHostAlbum(albumId, mode, options = {}) {
  if (!albumId) return
  const url = hostAlbumUrl(albumId, mode)
  if (options.replace) {
    wx.redirectTo({ url })
    return
  }
  wx.navigateTo({ url })
}

function promptMerchantHostEntry(options = {}) {
  const albumId = options.albumId
  const nav = { replace: Boolean(options.replace) }
  const prompt = buildHostPublicGatePrompt(options)
  if (!prompt) {
    openHostAlbum(albumId, undefined, nav)
    return
  }
  wx.showModal({
    title: prompt.title,
    content: prompt.content,
    confirmText: prompt.confirmText,
    cancelText: prompt.cancelText,
    success: (res) => {
      if (res.confirm) {
        navigatePublicGateAction(prompt.action)
        return
      }
      if (prompt.privateMode) {
        openHostAlbum(albumId, 'private', nav)
        return
      }
      if (prompt.openHost) openHostAlbum(albumId, undefined, nav)
    },
  })
}

module.exports = {
  AUTH_URL,
  PROFILE_URL,
  hostAlbumUrl,
  isListedOffHost,
  buildHostPublicGatePrompt,
  buildPublicPathBlockedPrompt,
  navigatePublicGateAction,
  openHostAlbum,
  promptMerchantHostEntry,
  promptPublicPathBlocked,
}
