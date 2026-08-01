const {
  fetchServiceAlbum,
  prepareServiceAuthorizePreview,
} = require('../../../services/service-album')
const {
  buildPublishInviteCopy,
  isPublicShareReady,
  resolveOwnerShareMode,
  CONTROL_LINE,
  PREVIEW_LABEL,
  PRIVATE_SHARE_TIP,
} = require('../../../utils/publish-thank-you')
const { initAlbumShareState } = require('../../../utils/album-share-state')
const { buildOwnerSharePayload } = require('../../../utils/album-owner-share')
const { buildPublicCaseSharePayload } = require('../../../utils/case-share')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    mode: 'private',
    detail: null,
    officerTitle: '透明维修体验官',
    heroPitch: '',
    heroTip: CONTROL_LINE,
    previewLabel: PREVIEW_LABEL,
    previewLoading: false,
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
      const invite = buildPublishInviteCopy({
        albumId: detail.albumId,
        vehicleLabel: detail.vehicleDisplay,
        serviceName: detail.serviceName,
      })
      const mode = resolveOwnerShareMode(detail)

      let heroPitch = invite.pitch
      let heroTip = invite.controlLine || CONTROL_LINE
      if (mode === 'published') {
        heroPitch = invite.publishedPitch || invite.pitch
        heroTip = invite.publishedTip || CONTROL_LINE
      } else if (mode === 'pending') {
        heroPitch = invite.pendingPitch || invite.pitch
        heroTip = invite.pendingTip || CONTROL_LINE
      } else if (mode === 'private') {
        heroPitch = invite.privatePitch || invite.pitch
        heroTip = invite.privateTip || PRIVATE_SHARE_TIP
      }

      const shareState = initAlbumShareState(detail)
      this.setData({
        status: 'normal',
        detail,
        mode,
        officerTitle: invite.officerTitle || '透明维修体验官',
        heroPitch,
        heroTip,
        previewLabel: invite.previewLabel || PREVIEW_LABEL,
        shareToken: shareState.shareToken || '',
        shareReady: Boolean(shareState.shareReady),
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  async onPreviewTap() {
    // 仅 invite 态可走公示预览；private 态不进入此入口
    if (this.data.mode !== 'invite') return
    await this.runAuthorizePreview()
  },

  async runAuthorizePreview() {
    const albumId = this.data.albumId
    if (!albumId || this.data.previewLoading) return
    this.setData({ previewLoading: true })
    try {
      wx.showLoading({ title: '加载预览', mask: true })
      const preview = await prepareServiceAuthorizePreview(albumId)
      wx.hideLoading()
      wx.navigateTo({
        url: `/pages/desensitize/preview/index?taskId=${preview.taskId}&albumId=${preview.albumId}&fromPreMask=${preview.fromPreMask ? 1 : 0}&source=service`,
      })
    } catch (e) {
      wx.hideLoading()
      const { showAuthorizePreviewError } = require('../../../utils/authorize-preview-error')
      showAuthorizePreviewError(e)
    } finally {
      this.setData({ previewLoading: false })
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

  onBack() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/mine/index' }),
    })
  },

  onShareAppMessage() {
    const detail = this.data.detail || {}
    if (isPublicShareReady(detail)) {
      return buildPublicCaseSharePayload(detail) || buildOwnerSharePayload(detail)
    }
    return buildOwnerSharePayload(detail) || {
      title: detail.serviceName ? `${detail.serviceName} · 服务相册` : '服务相册',
      path: `/pages/album/detail/index?albumId=${this.data.albumId}`,
    }
  },
})
