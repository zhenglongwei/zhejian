const { fetchHomeData } = require('../../services/home')
const { fetchStoreTopReviewTags } = require('../../services/review')
const { CASE_SOURCE } = require('../../constants/case-source')
const { buildStoreCardTags } = require('../../utils/store-tags')

Page({
  data: {
    status: 'loading',
    city: '杭州',
    serviceEntries: [],
    accidentEntry: null,
    recommendedMerchants: [],
    featuredCases: [],
    platformIntro: [],
    protectionText: '',
    showMerchants: false,
    showCases: false,
    hasHistoryCases: false,
    errorMessage: '',
  },

  onLoad() {
    this.loadHome()
  },

  onPullDownRefresh() {
    this.loadHome().finally(() => wx.stopPullDownRefresh())
  },

  async loadHome() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const data = await fetchHomeData()
      const featuredCases = data.featuredCases || []
      const merchants = await Promise.all(
        (data.recommendedMerchants || []).map(async (store) => {
          const reviewTags = await fetchStoreTopReviewTags(store.id, 2)
          return {
            ...store,
            cardTags: buildStoreCardTags(store, reviewTags),
          }
        })
      )
      this.setData({
        city: data.city.name,
        serviceEntries: data.serviceEntries,
        accidentEntry: data.accidentEntry,
        recommendedMerchants: merchants,
        featuredCases,
        platformIntro: data.platformIntro.points,
        protectionText: data.protectionText,
        showMerchants: merchants.length > 0,
        showCases: featuredCases.length > 0,
        hasHistoryCases: featuredCases.some(
          (c) => c.source === CASE_SOURCE.MERCHANT_HISTORY
        ),
        status: 'normal',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '页面加载失败，请稍后重试',
      })
    }
  },

  onRetry() {
    this.loadHome()
  },

  onCityTap() {
    wx.showModal({
      title: '服务城市',
      content: '当前平台首发服务城市为杭州，更多城市陆续开放。',
      showCancel: false,
    })
  },

  onSearchTap() {
    wx.showToast({
      title: '搜索功能将在后续版本开放',
      icon: 'none',
    })
  },

  onServiceEntryTap(e) {
    const { targetType, targetId } = e.currentTarget.dataset
    if (targetType === 'service' && targetId) {
      wx.navigateTo({
        url: `/pages/service/detail/index?id=${targetId}`,
      })
      return
    }
    if (targetType === 'category' && targetId) {
      const app = getApp()
      app.globalData.pendingServiceCategory = targetId
      wx.switchTab({ url: '/pages/service/index' })
    }
  },

  onAccidentCases() {
    wx.switchTab({ url: '/pages/case/index' })
  },

  onAccidentBook() {
    const { accidentEntry } = this.data
    const id = accidentEntry && accidentEntry.serviceId
    if (!id) return
    wx.navigateTo({
      url: `/pages/service/detail/index?id=${id}`,
    })
  },

  onViewAllMerchants() {
    const { recommendedMerchants } = this.data
    const first = recommendedMerchants[0]
    if (first) {
      wx.navigateTo({
        url: `/pages/store/detail/index?id=${first.id}`,
      })
    }
  },

  onStoreTap(e) {
    const storeId = (e.detail && e.detail.storeId) || e.currentTarget.dataset.storeId
    if (!storeId) return
    wx.navigateTo({
      url: `/pages/store/detail/index?id=${storeId}`,
    })
  },

  onCaseTap(e) {
    const { caseId } = e.detail
    wx.navigateTo({ url: `/pages/case/detail/index?id=${caseId}` })
  },

  onViewAllCases() {
    wx.switchTab({ url: '/pages/case/index' })
  },
})
