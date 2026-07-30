const {
  fetchServiceAlbum,
  prepareServiceAuthorizePreview,
  fetchAlbumSocialCopy,
  recordAlbumShare,
} = require('../../../services/service-album')
const {
  buildPublishInviteCopy,
  canShowPublishInvite,
  isPublicShareReady,
  CONTROL_LINE,
  PREVIEW_LABEL,
} = require('../../../utils/publish-thank-you')
const { initAlbumShareState } = require('../../../utils/album-share-state')
const {
  canOwnerShareAlbum,
  buildOwnerSharePayload,
  copyOwnerShareH5Link,
  SHARE_MODE,
  SHARE_CHANNEL,
} = require('../../../utils/album-owner-share')
const {
  buildPublicCaseSharePayload,
  copyPublicCaseWebLink,
} = require('../../../utils/case-share')
const { buildSocialDraft, copyTextToClipboard } = require('../../../utils/album-social-copy')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    mode: 'invite',
    detail: null,
    officerTitle: '',
    inviteHeroTitle: '爱车满血复活',
    inviteHeroSub: '',
    invitePitch: '',
    controlLine: CONTROL_LINE,
    previewLabel: PREVIEW_LABEL,
    publishedHeroTitle: '可以分享啦',
    publishedHeroSub: '脱敏案例已通过审核，欢迎发给需要的人',
    publishedHint: '可发给微信好友、朋友圈，或复制长文到自媒体。帮助同城车主少踩坑。',
    previewLoading: false,
    shareSheetVisible: false,
    socialPlatform: 'xiaohongshu',
    socialDraftText: '',
    socialDraftLoading: false,
    socialDraftWaitHint: '',
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
      const officerTitle = invite.officerTitle || ''
      this.setData({
        status: 'normal',
        detail,
        mode,
        officerTitle,
        inviteHeroSub: officerTitle
          ? `诚邀成为「${officerTitle}」，把脱敏过程分享给同城车友`
          : '把脱敏过程分享给同城车友，帮助更多人避开修车陷阱',
        invitePitch: invite.pitch,
        controlLine: invite.controlLine,
        previewLabel: invite.previewLabel,
        ...shareState,
      })
      if (mode === 'published') {
        this.loadSocialDraft(this.data.socialPlatform || 'xiaohongshu')
      }
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

  onOpenSocial() {
    this.setData({ shareSheetVisible: true })
    this.loadSocialDraft(this.data.socialPlatform || 'xiaohongshu')
  },

  onCloseShareSheet() {
    this.setData({ shareSheetVisible: false })
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

  onSocialPlatformChange(e) {
    const platform = (e.detail && e.detail.platform) || 'xiaohongshu'
    this.setData({
      socialPlatform: platform,
      socialDraftText: '',
      socialDraftWaitHint: '',
    })
    this.loadSocialDraft(platform)
  },

  async loadSocialDraft(platform) {
    const albumId = this.data.albumId
    if (!albumId) return
    this.setData({ socialDraftLoading: true, socialDraftWaitHint: '' })
    try {
      const data = await fetchAlbumSocialCopy(albumId, platform)
      if (this.data.socialPlatform !== platform) {
        this.setData({ socialDraftLoading: false })
        return
      }
      if (data && data.status === 'generating') {
        this.setData({
          socialDraftLoading: false,
          socialDraftText: '',
          socialDraftWaitHint: (data && data.message) || '文案准备中，请稍后再试',
        })
        return
      }
      this.setData({
        socialDraftText: (data && (data.text || data.body)) || '',
        socialDraftLoading: false,
        socialDraftWaitHint: '',
      })
    } catch (err) {
      this.setData({
        socialDraftLoading: false,
        socialDraftWaitHint: '',
        socialDraftText: buildSocialDraft(this.data.detail || {}, platform),
      })
    }
  },

  async onCopySocialDraft(e) {
    const platform =
      (e.detail && e.detail.platform) || this.data.socialPlatform || 'xiaohongshu'
    if (this.data.socialDraftWaitHint) {
      wx.showToast({ title: this.data.socialDraftWaitHint, icon: 'none' })
      return
    }
    const text = this.data.socialDraftText
    if (!text) {
      wx.showToast({ title: '文案尚未就绪', icon: 'none' })
      return
    }
    try {
      await copyTextToClipboard(text)
      if (canOwnerShareAlbum(this.data.detail)) {
        await recordAlbumShare(this.data.albumId, {
          mode: SHARE_MODE.DESENSITIZED,
          channel: `social_copy_${platform}`,
        })
      }
    } catch (_) {
      // toast in helper
    }
  },

  async onCopyOwnerShareLink() {
    try {
      const token = this.data.shareToken
      if (!token) {
        wx.showToast({ title: '链接准备中', icon: 'none' })
        return
      }
      await copyOwnerShareH5Link(token, this.data.detail, {
        channel: SHARE_CHANNEL.COPY_LINK,
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '复制失败', icon: 'none' })
    }
  },

  async onCopyPublicCaseLink() {
    try {
      await copyPublicCaseWebLink(this.data.detail)
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
    if (isPublicShareReady(detail)) {
      return buildPublicCaseSharePayload(detail) || buildOwnerSharePayload(detail)
    }
    return buildOwnerSharePayload(detail) || {
      title: detail.serviceName ? `${detail.serviceName} · 服务相册` : '服务相册',
      path: `/pages/album/detail/index?albumId=${this.data.albumId}`,
    }
  },
})
