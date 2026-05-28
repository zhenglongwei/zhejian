const {
  SERVICE_ALBUM_STATUS,
  SERVICE_ALBUM_STATUS_LABEL,
} = require('../../../constants/service-album-status')
const {
  fetchServiceAlbum,
  prepareServiceAuthorizePreview,
  submitServiceAlbumAuthorization,
  recordAlbumShare,
} = require('../../../services/service-album')
const { enrichServiceAlbumListItem } = require('../../../utils/service-album-display')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')
const {
  copyCaseShareLink,
  buildShareableCaseFromAlbum,
  canShareCase,
} = require('../../../utils/case-share')
const {
  canOwnerShareAlbum,
  buildOwnerSharePayload,
  copyOwnerShareLink,
  SHARE_MODE,
  SHARE_CHANNEL,
} = require('../../../utils/album-owner-share')
const { ORIGINAL_SHARE_RISK } = require('../../../constants/album-share')

const PUBLIC_CASE_HINT = {
  authorized: '你已授权公示，案例生成中，请稍后查看。',
  user_rejected: '你已拒绝公示，相册仍可作为私密服务相册查看。',
  pending_review: '公开案例已提交，审核通过后将自动展示在「案例」Tab 与公开网页。',
  public_approved:
    '案例已自动展示在「案例」Tab 与公开网页，无需额外发布。',
}

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    detail: null,
    albumStatusLabel: '',
    showAuthSection: false,
    showOwnerShareSection: false,
    showPublicCaseLinks: false,
    shareReady: false,
    shareUseOriginal: false,
    sharePreparing: false,
    shareToken: '',
    shareMode: SHARE_MODE.DESENSITIZED,
    publicCaseHint: '',
    authChecked: false,
    authTier: 'named',
    authSubmitting: false,
    showBottomBar: true,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
  },

  onLoad(options) {
    wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    this.albumId = options.albumId || options.id || ''
    this.fromMerchantShare = options.from === 'merchant_share'
    if (!this.albumId) {
      this.setData({
        status: 'error',
        errorMessage: '相册不存在或已被删除。',
        showBottomBar: false,
      })
      return
    }
    this.loadAlbum()
  },

  onShow() {
    if (this.albumId && ['normal', 'empty'].includes(this.data.status)) {
      this.loadAlbum()
    }
  },

  guardAccess() {
    const shareHint = this.fromMerchantShare ? '门店分享的服务相册' : '服务相册'
    if (!isLoggedIn()) {
      this.setData({
        status: 'error',
        errorMessage: `请先登录后查看${shareHint}。`,
        loginSheetVisible: true,
        loginSheetMode: 'login',
        showBottomBar: false,
      })
      return false
    }
    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      this.setData({
        status: 'error',
        errorMessage: `请先绑定手机号后查看${shareHint}。`,
        loginSheetVisible: true,
        loginSheetMode: 'bindPhone',
        showBottomBar: false,
      })
      return false
    }
    return true
  },

  async loadAlbum() {
    if (!this.guardAccess()) return

    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchServiceAlbum(this.albumId)
      const imageCount = detail.imageCount || 0
      const pageStatus = imageCount > 0 ? 'normal' : 'empty'
      const showAuthSection = this.shouldShowAuth(detail)
      const showOwnerShareSection = canOwnerShareAlbum(detail)
      const shareCase = buildShareableCaseFromAlbum(detail)
      const showPublicCaseLinks =
        detail.publicCaseStatus === 'public_approved' && Boolean(shareCase)
      const publicCaseHint = showAuthSection
        ? ''
        : PUBLIC_CASE_HINT[detail.publicCaseStatus] || ''
      const enriched = enrichServiceAlbumListItem({
        ...detail,
        id: detail.albumId,
      })

      this.setData({
        detail: enriched,
        albumStatusLabel: SERVICE_ALBUM_STATUS_LABEL[detail.status] || '',
        showAuthSection,
        showOwnerShareSection,
        showPublicCaseLinks,
        publicCaseHint,
        authChecked: false,
        status: pageStatus,
        showBottomBar: pageStatus === 'normal',
        shareReady: false,
        shareToken: '',
      })

      if (showOwnerShareSection) {
        await this.refreshShareToken({ silent: true })
      } else {
        this.updateShareMenu(false)
      }
    } catch (e) {
      const code = e && e.code
      let message = (e && e.message) || '加载失败'
      if (code === 403) {
        message =
          (e && e.message) ||
          '仅关联车主可查看，请确认登录手机号与门店登记一致'
      }
      if (code === 401) message = '请先登录后查看服务相册。'
      this.setData({
        status: 'error',
        errorMessage: message,
        detail: null,
        showBottomBar: false,
      })
    }
  },

  shouldShowAuth(detail) {
    if (!detail) return false
    if (detail.status !== SERVICE_ALBUM_STATUS.COMPLETED) return false
    if ((detail.imageCount || 0) < 1) return false
    const status = detail.publicCaseStatus
    return status === 'private' || status === 'authorization_pending'
  },

  async refreshShareToken(options = {}) {
    const { detail, shareUseOriginal } = this.data
    if (!detail || !canOwnerShareAlbum(detail)) {
      this.updateShareMenu(false)
      return
    }

    const mode = shareUseOriginal ? SHARE_MODE.ORIGINAL : SHARE_MODE.DESENSITIZED
    if (!options.silent) {
      this.setData({ sharePreparing: true, shareReady: false })
    }

    try {
      const result = await recordAlbumShare(detail.albumId, {
        mode,
        channel: SHARE_CHANNEL.WECHAT,
      })
      this.setData({
        shareToken: result.shareToken || '',
        shareMode: result.mode || mode,
        shareReady: Boolean(result.shareToken),
        sharePreparing: false,
      })
      this.updateShareMenu(Boolean(result.shareToken))
    } catch (e) {
      this.setData({ sharePreparing: false, shareReady: false, shareToken: '' })
      this.updateShareMenu(false)
      if (!options.silent) {
        wx.showToast({
          title: (e && e.message) || '分享准备失败',
          icon: 'none',
        })
      }
    }
  },

  onShareOriginalToggle() {
    const { shareUseOriginal, sharePreparing } = this.data
    if (sharePreparing) return

    if (!shareUseOriginal) {
      wx.showModal({
        title: '原图分享风险提示',
        content: ORIGINAL_SHARE_RISK,
        confirmText: '仍用原图',
        cancelText: '取消',
        success: (res) => {
          if (!res.confirm) return
          this.setData({ shareUseOriginal: true }, () => {
            this.refreshShareToken()
          })
        },
      })
      return
    }

    this.setData({ shareUseOriginal: false }, () => {
      this.refreshShareToken()
    })
  },

  onRetry() {
    this.loadAlbum()
  },

  onAuthCheckToggle() {
    this.setData({ authChecked: !this.data.authChecked })
  },

  onAuthTierChange(e) {
    const tier = e.detail && e.detail.tier
    if (tier !== 'named' && tier !== 'anonymous') return
    this.setData({ authTier: tier })
  },

  onSubmitAuth() {
    const { detail, authChecked, authSubmitting } = this.data
    if (!detail || !authChecked || authSubmitting) return
    this.openAuthorizePreview()
  },

  async openAuthorizePreview() {
    this.setData({ authSubmitting: true })
    try {
      wx.showLoading({ title: '加载预览', mask: true })
      const preview = await prepareServiceAuthorizePreview(this.albumId)
      wx.hideLoading()
      wx.navigateTo({
        url: `/pages/desensitize/preview/index?taskId=${preview.taskId}&albumId=${preview.albumId}&fromPreMask=${preview.fromPreMask ? 1 : 0}&source=service&tier=${this.data.authTier}`,
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({
        title: (e && e.message) || '预览加载失败',
        icon: 'none',
      })
    } finally {
      this.setData({ authSubmitting: false })
    }
  },

  onRejectAuth() {
    const { detail, authSubmitting } = this.data
    if (!detail || authSubmitting) return
    wx.showModal({
      title: '拒绝公示',
      content:
        '拒绝后，本次服务相册仍仅作为你的私密记录保存，不会生成公开案例。',
      confirmText: '确认拒绝',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) return
        this.submitAuthDecision(false)
      },
    })
  },

  async submitAuthDecision(agreed) {
    const { detail } = this.data
    if (!detail) return
    this.setData({ authSubmitting: true })
    try {
      wx.showLoading({ title: '提交中', mask: true })
      await submitServiceAlbumAuthorization(detail.albumId, { agreed })
      wx.hideLoading()
      wx.showToast({
        title: agreed ? '已授权公示' : '已记录你的选择',
        icon: 'success',
      })
      this.loadAlbum()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({
        title: (e && e.message) || '提交失败',
        icon: 'none',
      })
    } finally {
      this.setData({ authSubmitting: false })
    }
  },

  onCallStore() {
    const store = this.data.detail && this.data.detail.store
    const phone = store && store.phone
    if (!phone) {
      wx.showToast({ title: '暂无门店电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  onSupport() {
    wx.showToast({
      title: '客服功能将在后续版本开放',
      icon: 'none',
    })
  },

  onFeedback() {
    wx.showToast({
      title: '问题反馈将在后续版本开放',
      icon: 'none',
    })
  },

  onOpenBenefitPolicy() {
    wx.navigateTo({ url: '/pages/benefit-sharing/index' })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSheetSuccess() {
    this.closeLoginSheet()
    this.loadAlbum()
  },

  updateShareMenu(ready) {
    if (ready) {
      wx.showShareMenu({
        withShareTicket: false,
        menus: ['shareAppMessage'],
      })
    } else {
      wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    }
  },

  onShareAppMessage() {
    const { detail, shareToken, shareMode } = this.data
    const payload = buildOwnerSharePayload(detail, {
      shareToken,
      mode: shareMode,
    })
    if (payload) return payload
    return {
      title: '辙见 · 我的服务相册',
      path: '/pages/album/list/index',
    }
  },

  async onCopyOwnerShareLink() {
    const { shareToken, sharePreparing } = this.data
    if (sharePreparing) return
    if (!shareToken) {
      await this.refreshShareToken()
    }
    const token = this.data.shareToken
    if (!token) {
      wx.showToast({ title: '分享尚未就绪，请稍后再试', icon: 'none' })
      return
    }
    try {
      await recordAlbumShare(this.data.detail.albumId, {
        mode: this.data.shareMode,
        channel: SHARE_CHANNEL.LINK,
      })
      await copyOwnerShareLink(token)
    } catch (e) {
      wx.showToast({
        title: (e && e.message) || '复制失败',
        icon: 'none',
      })
    }
  },

  onCopyCaseWebLink() {
    const shareCase = buildShareableCaseFromAlbum(this.data.detail)
    if (!shareCase || !canShareCase(shareCase)) {
      wx.showToast({ title: '平台公开链接尚未就绪', icon: 'none' })
      return
    }
    copyCaseShareLink(shareCase.id, shareCase)
  },

  onViewPublicCase() {
    const shareCase = buildShareableCaseFromAlbum(this.data.detail)
    if (!shareCase || !shareCase.id) return
    wx.navigateTo({ url: `/pages/case/detail/index?id=${shareCase.id}` })
  },
})
