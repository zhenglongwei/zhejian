const {
  SERVICE_ALBUM_STATUS,
  SERVICE_ALBUM_STATUS_LABEL,
} = require('../../../constants/service-album-status')
const {
  fetchServiceAlbum,
  prepareServiceAuthorizePreview,
  submitServiceAlbumAuthorization,
} = require('../../../services/service-album')
const { enrichServiceAlbumListItem } = require('../../../utils/service-album-display')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')

const PUBLIC_CASE_HINT = {
  authorized: '你已授权公开，案例生成中，请稍后查看。',
  user_rejected: '你已拒绝公开，相册仍可作为私密服务相册查看。',
  pending_review: '公开案例已提交审核，审核通过后将展示。',
  public_approved: '公开案例已展示，可在案例 Tab 查看。',
}

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    detail: null,
    albumStatusLabel: '',
    showAuthSection: false,
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
        publicCaseHint,
        authChecked: false,
        status: pageStatus,
        showBottomBar: pageStatus === 'normal',
      })
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
      title: '拒绝公开',
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
        title: agreed ? '已确认公开' : '已记录你的选择',
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
})
