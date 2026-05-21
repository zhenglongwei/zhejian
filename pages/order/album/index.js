const { ORDER_STATUS } = require('../../../constants/order-status')
const {
  fetchOrderAlbum,
  prepareAuthorizePreview,
  submitAlbumAuthorization,
} = require('../../../services/order-album')
const { handleOrderAction } = require('../../../utils/order-actions')

const ALBUM_STATUS_LABEL = {
  empty: '待上传',
  uploaded: '维修中',
  editing: '维修中',
  completed: '已提交完工',
  report_generated: '已生成交付报告',
}

const PUBLIC_CASE_HINT = {
  authorized: '你已授权公开，案例生成中，请稍后查看。',
  user_rejected: '你已拒绝公开，相册仍可作为私密维修档案查看。',
  pending_review: '公开案例处理中，请稍后查看。',
  public_approved: '维修案例已公开，可在案例 Tab 查看。',
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
    authSubmitting: false,
    showBottomBar: true,
  },

  onLoad(options) {
    wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    this.orderId = options.orderId || options.id || ''
    if (!this.orderId) {
      this.setData({
        status: 'error',
        errorMessage: '订单不存在或已被删除。',
      })
      return
    }
    this.loadAlbum()
  },

  async loadAlbum() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchOrderAlbum(this.orderId)
      const imageCount = detail.imageCount || 0
      const pageStatus = imageCount > 0 ? 'normal' : 'empty'
      const showAuthSection = this.shouldShowAuth(detail)
      const publicCaseHint = showAuthSection
        ? ''
        : PUBLIC_CASE_HINT[detail.publicCaseStatus] || ''

      this.setData({
        detail,
        albumStatusLabel: ALBUM_STATUS_LABEL[detail.albumStatus] || '',
        showAuthSection,
        publicCaseHint,
        authChecked: false,
        status: pageStatus,
        showBottomBar: pageStatus === 'normal',
      })
    } catch (e) {
      const code = e && e.code
      let message = (e && e.message) || '加载失败'
      if (code === 403) message = '你无权查看该维修相册。'
      if (code === 401) message = '请先登录后查看维修相册。'
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
    if (detail.orderStatus !== ORDER_STATUS.COMPLETED) return false
    if ((detail.imageCount || 0) < 1) return false
    if (detail.aftersaleBlocked) return false
    const status = detail.publicCaseStatus
    return status === 'private' || status === 'authorization_pending'
  },

  onRetry() {
    this.loadAlbum()
  },

  onAuthCheckToggle() {
    this.setData({ authChecked: !this.data.authChecked })
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
      const preview = await prepareAuthorizePreview(this.orderId)
      wx.hideLoading()
      wx.navigateTo({
        url: `/pages/desensitize/preview/index?taskId=${preview.taskId}&albumId=${preview.albumId}&orderId=${this.orderId}&fromPreMask=${preview.fromPreMask ? 1 : 0}`,
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
        '拒绝后，本次维修档案仍仅作为你的私密记录保存，不会生成公开案例。',
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
      await submitAlbumAuthorization(detail.albumId, { agreed })
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
    handleOrderAction('call', {
      order: { id: this.orderId },
      detail: { store: store || {} },
    })
  },

  onSupport() {
    handleOrderAction('support', {
      order: { id: this.orderId },
      detail: this.data.detail,
    })
  },

  onFeedback() {
    wx.showToast({
      title: '问题反馈将在后续版本开放',
      icon: 'none',
    })
  },

  onOpenBenefitPolicy() {
    wx.navigateTo({
      url: '/pages/benefit-sharing/index',
    })
  },

  onBackOrder() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({
          url: `/pages/order/detail/index?id=${this.orderId}`,
        })
      },
    })
  },

})
