const { fetchServiceAlbum, fetchAlbumSocialCards, recordAlbumShare } = require('../../../services/service-album')
const {
  buildOwnerSharePayload,
  copyOwnerShareH5Link,
  SHARE_CHANNEL,
  SHARE_MODE,
} = require('../../../utils/album-owner-share')
const {
  applySocialPayload,
  rememberSocialText,
  rememberSocialCaption,
  switchSocialPlatform,
  toggleSocialImage,
} = require('../../../utils/social-card-session')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    cardError: '',
    albumId: '',
    detail: null,
    shareToken: '',
    socialPlatforms: [],
    socialPlatform: 'moments',
    socialImages: [],
    socialTexts: {},
    socialText: '',
    socialLoading: false,
    socialSaveDisabled: true,
  },

  onLoad(options) {
    const albumId = (options && options.albumId) || ''
    this.setData({ albumId })
    if (!albumId) {
      this.setData({ status: 'error', errorMessage: '缺少相册信息' })
      return
    }
    this.loadDetail()
  },

  async loadDetail() {
    this.setData({ status: 'loading', errorMessage: '', cardError: '' })
    try {
      const detail = await fetchServiceAlbum(this.data.albumId)
      let cards = null
      let cardError = ''
      try {
        cards = await fetchAlbumSocialCards(this.data.albumId)
      } catch (e) {
        cardError = (e && e.message) || '暂时准备不好'
      }
      if (cards) applySocialPayload(this, cards, '照片还在处理')
      this.setData({
        status: 'normal',
        detail,
        cardError,
      })
      if (!cardError) this.refreshShareToken()
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  async onRefreshSocial() {
    if (!this.data.albumId || this._socialOpening) return
    this._socialOpening = true
    this.setData({ socialRefreshing: true })
    try {
      const cards = await fetchAlbumSocialCards(this.data.albumId, { refresh: true })
      applySocialPayload(this, cards, '照片还在处理')
    } catch (e) {
      this.setData({ socialRefreshing: false })
      wx.showToast({ title: (e && e.message) || '暂时准备不好', icon: 'none' })
    } finally {
      this._socialOpening = false
    }
  },

  onSocialPlatform(e) {
    switchSocialPlatform(this, e.detail && e.detail.id)
  },

  onSocialToggle(e) {
    toggleSocialImage(this, e.detail && e.detail.id)
  },

  onSocialText(e) {
    rememberSocialText(this, e.detail && e.detail.value)
  },

  onSocialCaption(e) {
    rememberSocialCaption(this, e.detail && e.detail.value)
  },

  onDownloadPoster() {
    const card = this.selectComponent('#socialPosterCard')
    if (card && card.downloadPoster) card.downloadPoster()
  },

  async refreshShareToken() {
    const detail = this.data.detail
    if (!detail || !detail.albumId) return
    try {
      const result = await recordAlbumShare(detail.albumId, {
        mode: SHARE_MODE.DESENSITIZED,
        channel: SHARE_CHANNEL.WECHAT,
      })
      this.setData({ shareToken: result.shareToken || '' })
    } catch (e) {
      this.setData({ shareToken: '' })
    }
  },

  async onCopyLinkTap() {
    let token = this.data.shareToken
    if (!token) {
      await this.refreshShareToken()
      token = this.data.shareToken
    }
    if (!token) {
      wx.showToast({ title: '链接还没准备好', icon: 'none' })
      return
    }
    try {
      await copyOwnerShareH5Link(token, this.data.detail, { mode: SHARE_MODE.DESENSITIZED })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '复制失败', icon: 'none' })
    }
  },

  onBack() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/mine/index' }),
    })
  },

  onShareAppMessage() {
    const detail = this.data.detail || {}
    return (
      buildOwnerSharePayload(detail, { shareToken: this.data.shareToken }) || {
        title: detail.serviceName ? `${detail.serviceName} · 服务相册` : '服务相册',
        path: `/pages/album/detail/index?albumId=${this.data.albumId}`,
      }
    )
  },

  onShareTimeline() {
    const detail = this.data.detail || {}
    const payload = buildOwnerSharePayload(detail, { shareToken: this.data.shareToken })
    if (!payload) {
      return { title: detail.serviceName || '服务相册' }
    }
    return { title: payload.title, query: `albumId=${this.data.albumId}` }
  },
})
