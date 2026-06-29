const { fetchAlbumReviewContext } = require('../../../services/album-review')
const { checkAuth, getSession } = require('../../../utils/auth')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    albumTitle: '',
    storeName: '',
    eligible: false,
    ineligibleReason: '',
    hasReview: false,
    loginSheetVisible: false,
  },

  onLoad(options) {
    const albumId = String(options.albumId || '').trim()
    const albumTitle = decodeURIComponent(options.albumTitle || '')
    if (!albumId) {
      this.setData({
        status: 'error',
        errorMessage: '缺少相册信息，请从服务相册详情进入',
      })
      return
    }
    this.setData({ albumId, albumTitle })
    if (!checkAuth().ok) {
      this.setData({ loginSheetVisible: true })
    }
    this.loadContext(albumTitle)
  },

  async loadContext(fallbackTitle = '') {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const data = await fetchAlbumReviewContext(this.data.albumId)
      this.setData({
        status: 'normal',
        albumTitle: data.albumTitle || fallbackTitle || '我的服务相册',
        storeName: data.storeName || '',
        eligible: Boolean(data.eligible),
        ineligibleReason: data.ineligibleReason || '',
        hasReview: Boolean(data.review && data.review.id),
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onRetry() {
    this.loadContext(this.data.albumTitle)
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  ensureAuth() {
    const auth = checkAuth()
    if (!auth.ok) {
      this.setData({ loginSheetVisible: true })
      return false
    }
    return true
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSuccess() {
    this.closeLoginSheet()
    this.loadContext(this.data.albumTitle)
  },

  buildBaseQuery() {
    const { albumId, albumTitle } = this.data
    return (
      `albumId=${encodeURIComponent(albumId)}` +
      `&albumTitle=${encodeURIComponent(albumTitle)}`
    )
  },

  onOpenReview() {
    if (!this.ensureAuth()) return
    const { hasReview, eligible } = this.data
    if (hasReview) {
      wx.showToast({ title: '你已评价过本次服务', icon: 'none' })
      return
    }
    if (!eligible) {
      wx.showToast({
        title: this.data.ineligibleReason || '暂不可评价',
        icon: 'none',
      })
      return
    }
    wx.navigateTo({
      url: `/pages/album/review/submit/index?${this.buildBaseQuery()}`,
    })
  },

  onOpenFeedback() {
    if (!this.ensureAuth()) return
    wx.navigateTo({
      url: `/pages/album/feedback/index?${this.buildBaseQuery()}`,
    })
  },
})
