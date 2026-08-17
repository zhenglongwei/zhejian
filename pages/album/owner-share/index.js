const { fetchServiceAlbum, recordAlbumShare } = require('../../../services/service-album')
const { PRIVATE_SHARE_TIP } = require('../../../utils/publish-thank-you')
const { initAlbumShareState } = require('../../../utils/album-share-state')
const {
  buildOwnerSharePayload,
  copyOwnerShareH5Link,
  SHARE_CHANNEL,
  SHARE_MODE,
} = require('../../../utils/album-owner-share')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    mode: 'private',
    detail: null,
    officerTitle: '',
    heroPitch: '把这份维修相册发给朋友。店有没有放到店页，都不影响你分享。',
    heroTip: PRIVATE_SHARE_TIP,
    shareToken: '',
    shareReady: false,
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

  onShow() {
    if (this.data.albumId && this.data.status === 'normal') {
      this.loadDetail({ silent: true })
    }
  },

  async loadDetail(options = {}) {
    if (!options.silent) {
      this.setData({ status: 'loading', errorMessage: '' })
    }
    try {
      const detail = await fetchServiceAlbum(this.data.albumId)
      const shareState = initAlbumShareState(detail)
      const keepToken = this.data.shareToken || ''
      this.setData({
        status: 'normal',
        detail,
        mode: 'private',
        officerTitle: '',
        heroPitch: '把这份维修相册发给朋友。店有没有放到店页，都不影响你分享。',
        heroTip: PRIVATE_SHARE_TIP,
        shareToken: keepToken,
        shareReady: Boolean(keepToken),
      })
      if (shareState.showShareEntry && !keepToken) {
        await this.refreshShareToken()
      }
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  async refreshShareToken() {
    const detail = this.data.detail
    if (!detail || !detail.albumId) return
    try {
      const result = await recordAlbumShare(detail.albumId, {
        mode: SHARE_MODE.DESENSITIZED,
        channel: SHARE_CHANNEL.WECHAT,
      })
      this.setData({
        shareToken: result.shareToken || '',
        shareReady: Boolean(result.shareToken),
      })
    } catch (e) {
      this.setData({ shareReady: false })
    }
  },

  onShareTimelineGuide() {
    wx.showModal({
      title: '分享到朋友圈',
      content: '请点击右上角 ···，选择「分享到朋友圈」。',
      showCancel: false,
    })
  },

  onTimelineTap() {
    this.onShareTimelineGuide()
  },

  async onCopyLinkTap() {
    let token = this.data.shareToken
    if (!token) {
      await this.refreshShareToken()
      token = this.data.shareToken
    }
    if (!token) {
      wx.showToast({ title: '分享尚未就绪，请稍后再试', icon: 'none' })
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
})
