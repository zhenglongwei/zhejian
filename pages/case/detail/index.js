const { fetchCaseDetail } = require('../../../services/case')
const { fetchReviewByOrderId } = require('../../../services/review')
const { buildCaseTags } = require('../../../utils/case-tags')
const { CASE_SOURCE } = require('../../../constants/case-source')
const { copyCaseShareLink } = require('../../../utils/case-share')

Page({
  data: {
    status: 'loading',
    detail: null,
    tagList: [],
    errorMessage: '',
    isHistory: true,
    relatedCases: [],
    faqList: [],
    linkedReview: null,
  },

  onLoad(options) {
    wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    this.caseId = options.id || ''
    if (!this.caseId) {
      this.setData({ status: 'error', errorMessage: '案例不存在' })
      return
    }
    this.loadDetail()
  },

  async loadDetail() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchCaseDetail(this.caseId)
      let linkedReview = null
      if (
        detail.source === CASE_SOURCE.PLATFORM_ORDER &&
        detail.orderId
      ) {
        linkedReview = await fetchReviewByOrderId(detail.orderId)
      }
      this.setData({
        detail,
        tagList: buildCaseTags(detail.source),
        isHistory: detail.source === CASE_SOURCE.MERCHANT_HISTORY,
        relatedCases: detail.relatedCases || [],
        faqList: detail.faq || [],
        linkedReview,
        linkedReviews: linkedReview ? [linkedReview] : [],
        status: 'normal',
      })
      wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage', 'shareTimeline'] })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
      wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    }
  },

  onRetry() {
    this.loadDetail()
  },

  onBook() {
    const { detail } = this.data
    if (!detail) return
    if (detail.serviceItemId) {
      wx.navigateTo({
        url: `/pages/service/detail/index?id=${detail.serviceItemId}`,
      })
      return
    }
    if (detail.storeId) {
      wx.navigateTo({
        url: `/pages/store/detail/index?id=${detail.storeId}`,
      })
      return
    }
    wx.switchTab({ url: '/pages/service/index' })
  },

  onShare() {
    const { detail } = this.data
    if (!detail || !detail.id) return
    copyCaseShareLink(detail.id)
  },

  onShareAppMessage() {
    const { detail } = this.data
    if (!detail || !detail.id) {
      return {
        title: '透明维修 · 公开案例',
        path: '/pages/case/index',
      }
    }
    return {
      title: `${detail.title} · 已脱敏公开案例`,
      path: `/pages/case/detail/index?id=${detail.id}`,
    }
  },

  onStoreTap() {
    const { detail } = this.data
    if (!detail || !detail.storeId) return
    wx.navigateTo({
      url: `/pages/store/detail/index?id=${detail.storeId}`,
    })
  },

  onRelatedCaseTap(e) {
    const { caseId } = e.detail
    if (!caseId) return
    wx.navigateTo({ url: `/pages/case/detail/index?id=${caseId}` })
  },
})
