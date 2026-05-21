const { fetchStoreDetail } = require('../../../services/store')
const { fetchCaseList } = require('../../../services/case')
const { fetchServiceList } = require('../../../services/service')
const {
  fetchStoreReviews,
  fetchStoreTopReviewTags,
} = require('../../../services/review')
const { buildStoreHeadTags } = require('../../../utils/store-tags')
const { CASE_SOURCE } = require('../../../constants/case-source')

const STATUS_TEXT = {
  open: '营业中',
  closed: '休息中',
  holiday: '节假日休息',
  suspended: '暂停预约',
  offline: '暂不可预约',
}

Page({
  data: {
    status: 'loading',
    store: null,
    cases: [],
    casesStatus: 'loading',
    services: [],
    servicesStatus: 'loading',
    statusText: '',
    headTags: [],
    hasHistoryCases: false,
    reviewTags: [],
    reviews: [],
    reviewsStatus: 'loading',
    errorMessage: '',
  },

  onLoad(options) {
    this.storeId = options.id || 'store_demo_1'
    this.loadPage()
  },

  onPullDownRefresh() {
    this.loadPage().finally(() => wx.stopPullDownRefresh())
  },

  async loadPage() {
    this.setData({ status: 'loading', casesStatus: 'loading', servicesStatus: 'loading', reviewsStatus: 'loading', errorMessage: '' })
    try {
      const [store, { list: cases }, { list: services }] = await Promise.all([
        fetchStoreDetail(this.storeId),
        fetchCaseList({ storeId: this.storeId }),
        fetchServiceList({ storeId: this.storeId }),
      ])
      const reviewModule = await this.loadReviewsModule()
      this.setData({
        store: { ...store, caseCount: cases.length },
        headTags: buildStoreHeadTags(store),
        reviewTags: reviewModule.reviewTags,
        reviews: reviewModule.reviews,
        reviewsStatus: reviewModule.reviewsStatus,
        hasHistoryCases: cases.some(
          (c) => c.source === CASE_SOURCE.MERCHANT_HISTORY
        ),
        cases,
        services,
        statusText: STATUS_TEXT[store.status] || store.status,
        status: 'normal',
        casesStatus: cases.length ? 'normal' : 'empty',
        servicesStatus: services.length ? 'normal' : 'empty',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败，请重试',
      })
    }
  },

  async loadReviewsModule() {
    try {
      const [reviewTags, { list: reviews }] = await Promise.all([
        fetchStoreTopReviewTags(this.storeId, 5),
        fetchStoreReviews(this.storeId, { limit: 3 }),
      ])
      return {
        reviewTags,
        reviews,
        reviewsStatus: reviews.length ? 'normal' : 'empty',
      }
    } catch (e) {
      return {
        reviewTags: [],
        reviews: [],
        reviewsStatus: 'error',
      }
    }
  },

  async onRetryReviews() {
    this.setData({ reviewsStatus: 'loading' })
    const reviewModule = await this.loadReviewsModule()
    this.setData({
      reviewTags: reviewModule.reviewTags,
      reviews: reviewModule.reviews,
      reviewsStatus: reviewModule.reviewsStatus,
    })
  },

  onRetry() {
    this.loadPage()
  },

  onCaseTap(e) {
    const { caseId } = e.detail
    wx.navigateTo({ url: `/pages/case/detail/index?id=${caseId}` })
  },

  onViewAllCases() {
    wx.switchTab({ url: '/pages/case/index' })
  },

  onViewAllServices() {
    wx.switchTab({ url: '/pages/service/index' })
  },

  onServiceTap(e) {
    const { serviceId } = e.detail
    if (!serviceId) return
    wx.navigateTo({
      url: `/pages/service/detail/index?id=${serviceId}`,
    })
  },

  onCall() {
    const { store } = this.data
    if (!store || !store.phone) return
    wx.makePhoneCall({ phoneNumber: store.phone })
  },

  onNavigate() {
    const { store } = this.data
    if (!store || store.latitude == null || store.longitude == null) {
      wx.showToast({ title: '暂无导航信息', icon: 'none' })
      return
    }
    wx.openLocation({
      latitude: store.latitude,
      longitude: store.longitude,
      name: store.name,
      address: store.address,
      scale: 16,
    })
  },

  onBook() {
    const { services } = this.data
    if (!services || !services.length) {
      wx.showToast({ title: '该门店暂无可预约服务', icon: 'none' })
      return
    }
    if (services.length === 1) {
      const svc = services[0]
      wx.navigateTo({
        url: `/pages/order-confirm/index?serviceId=${svc.id}&storeId=${this.storeId}`,
      })
      return
    }
    wx.showActionSheet({
      itemList: services.map((s) => s.name),
      success: (res) => {
        const svc = services[res.tapIndex]
        if (!svc) return
        wx.navigateTo({
          url: `/pages/order-confirm/index?serviceId=${svc.id}&storeId=${this.storeId}`,
        })
      },
    })
  },
})
