const { fetchServiceDetail } = require('../../../services/service')
const { fetchServiceReviews } = require('../../../services/review')
const { PRICE_MODE } = require('../../../constants/price-mode')
const { checkAuth } = require('../../../utils/auth')

Page({
  data: {
    status: 'loading',
    detail: null,
    errorMessage: '',
    isAccident: false,
    showPriceFactors: false,
    primaryAction: '选择门店',
    secondaryAction: '',
    casesAnchor: 'cases-section',
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'order',
    pendingOrderAction: false,
    serviceReviews: [],
    serviceReviewsStatus: 'loading',
  },

  onLoad(options) {
    this.serviceId = options.id || ''
    if (!this.serviceId) {
      this.setData({ status: 'error', errorMessage: '服务不存在' })
      return
    }
    this.loadDetail()
  },

  onPullDownRefresh() {
    this.loadDetail().finally(() => wx.stopPullDownRefresh())
  },

  async loadDetail() {
    this.setData({ status: 'loading', errorMessage: '', serviceReviewsStatus: 'loading' })
    try {
      const detail = await fetchServiceDetail(this.serviceId, { audience: 'user' })
      const reviewModule = await this.loadServiceReviewsModule()
      const bar = this.buildBottomBar(detail)
      this.setData({
        detail,
        serviceReviews: reviewModule.reviews,
        serviceReviewsStatus: reviewModule.reviewsStatus,
        isAccident: detail.priceMode === PRICE_MODE.ACCIDENT,
        showPriceFactors:
          detail.priceMode === PRICE_MODE.RANGE ||
          detail.priceMode === PRICE_MODE.CONSULT ||
          detail.priceMode === PRICE_MODE.ACCIDENT,
        primaryAction: bar.primary,
        secondaryAction: bar.secondary,
        status: 'normal',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败，请重试',
      })
    }
  },

  async loadServiceReviewsModule() {
    try {
      const { list: reviews } = await fetchServiceReviews(this.serviceId, { limit: 3 })
      return {
        reviews,
        reviewsStatus: reviews.length ? 'normal' : 'empty',
      }
    } catch (e) {
      return {
        reviews: [],
        reviewsStatus: 'error',
      }
    }
  },

  async onRetryServiceReviews() {
    this.setData({ serviceReviewsStatus: 'loading' })
    const reviewModule = await this.loadServiceReviewsModule()
    this.setData({
      serviceReviews: reviewModule.reviews,
      serviceReviewsStatus: reviewModule.reviewsStatus,
    })
  },

  buildBottomBar(detail) {
    if (!detail.bookable) {
      return { primary: '该服务暂不可预约', secondary: '' }
    }
    if (detail.priceMode === PRICE_MODE.FIXED) {
      return { primary: '立即下单', secondary: '选择门店' }
    }
    if (detail.priceMode === PRICE_MODE.ACCIDENT) {
      return { primary: '预约门店检测', secondary: '查看类似案例' }
    }
    return { primary: '预约到店检测', secondary: '咨询客服' }
  },

  onRetry() {
    this.loadDetail()
  },

  onCaseTap(e) {
    const { caseId } = e.detail
    wx.navigateTo({ url: `/pages/case/detail/index?id=${caseId}` })
  },

  onViewAllCases() {
    wx.switchTab({ url: '/pages/case/index' })
  },

  onStoreTap(e) {
    const storeId = (e.detail && e.detail.storeId) || e.currentTarget.dataset.storeId
    if (!storeId) return
    wx.navigateTo({ url: `/pages/store/detail/index?id=${storeId}` })
  },

  ensureOrderAuth() {
    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      this.setData({
        loginSheetVisible: true,
        loginSheetMode: auth.reason === 'bindPhone' ? 'bindPhone' : 'auto',
        loginSheetBindContext: 'order',
        pendingOrderAction: true,
      })
      return false
    }
    return true
  },

  onPrimaryAction() {
    const { detail } = this.data
    if (!detail || !detail.bookable) return
    if (!this.ensureOrderAuth()) return
    this.doPrimaryAction()
  },

  doPrimaryAction() {
    const { detail } = this.data
    if (!detail) return
    wx.navigateTo({
      url: `/pages/order-confirm/index?serviceId=${detail.id}&storeId=${detail.storeId || ''}`,
    })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false, pendingOrderAction: false })
  },

  onLoginSheetSuccess() {
    this.setData({ loginSheetVisible: false })
    if (!this.data.pendingOrderAction) return
    this.setData({ pendingOrderAction: false })
    const auth = checkAuth({ needPhone: true })
    if (auth.ok) {
      this.doPrimaryAction()
    }
  },

  onSecondaryAction() {
    const { detail } = this.data
    if (!detail) return
    if (this.data.secondaryAction === '查看类似案例') {
      wx.pageScrollTo({ selector: `#${this.data.casesAnchor}`, duration: 300 })
      return
    }
    if (this.data.secondaryAction === '选择门店') {
      if (detail.storeId) {
        wx.navigateTo({
          url: `/pages/store/detail/index?id=${detail.storeId}`,
        })
      }
      return
    }
    if (this.data.secondaryAction === '咨询客服') {
      wx.showToast({ title: '客服功能将在 V0.5 开放', icon: 'none' })
      return
    }
  },

  showComingSoon(label) {
    wx.showToast({
      title: `${label}功能将在 V0.5 开放`,
      icon: 'none',
    })
  },
})
