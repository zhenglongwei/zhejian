const {
  fetchServiceAlbum,
  prepareServiceAuthorizePreview,
} = require('../../../services/service-album')
const {
  buildPublishInviteCopy,
  canShowPublishInvite,
  isPublicShareReady,
  CONTROL_LINE,
  PREVIEW_LABEL,
} = require('../../../utils/publish-thank-you')
const { initAlbumShareState } = require('../../../utils/album-share-state')
const { buildOwnerSharePayload } = require('../../../utils/album-owner-share')
const { buildPublicCaseSharePayload } = require('../../../utils/case-share')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    mode: 'invite',
    detail: null,
    officerTitle: '透明维修体验官',
    invitePitch: '',
    controlLine: CONTROL_LINE,
    previewLabel: PREVIEW_LABEL,
    publishedHeroTitle: '可以分享啦',
    publishedHeroSub: '脱敏案例已通过审核，欢迎发给需要的人',
    publishedHint: '可发给微信好友或朋友圈。帮助同城车主少踩坑。',
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
      let mode = 'invite'
      if (isPublicShareReady(detail)) mode = 'published'
      else if ((detail.publicCaseStatus || '') === 'pending_review') mode = 'pending'
      else if (canShowPublishInvite(detail) || detail.publicCaseStatus === 'need_modify') {
        mode = 'invite'
      } else {
        mode = 'invite'
      }

      const shareState = initAlbumShareState(detail)
      const officerTitle = invite.officerTitle || '透明维修体验官'
      this.setData({
        status: 'normal',
        detail,
        mode,
        officerTitle,
        invitePitch: invite.pitch,
        controlLine: invite.controlLine || CONTROL_LINE,
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
