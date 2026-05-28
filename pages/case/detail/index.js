const { fetchCaseDetail } = require('../../../services/case')
const {
  copyCaseShareLink,
  buildCaseSharePayload,
  canShareCase,
} = require('../../../utils/case-share')

const BOTTOM_LEFT_ACTIONS = [
  { key: 'call', type: 'secondary', text: '电话咨询' },
  { key: 'share', type: 'ghost', text: '网页链接' },
]

Page({
  data: {
    status: 'loading',
    detail: null,
    errorMessage: '',
    relatedCases: [],
    faqList: [],
    showStorePublicly: true,
    bottomLeftActions: BOTTOM_LEFT_ACTIONS,
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
      this.setData({
        detail,
        showStorePublicly: detail.showStorePublicly !== false,
        relatedCases: detail.relatedCases || [],
        faqList: detail.faq || [],
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

  onBottomLeftAction(e) {
    const { key } = e.detail
    if (key === 'call') this.onCall()
    else if (key === 'share') this.onShare()
  },

  onCall() {
    const { detail } = this.data
    const phone = detail && detail.storePhone
    if (!phone) {
      wx.showToast({ title: '暂无门店电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  onMessage() {
    const { detail } = this.data
    if (!detail || !detail.storeId) {
      wx.showToast({ title: '门店信息不完整', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/consult/submit/index?storeId=${detail.storeId}&caseId=${detail.id}&sourcePage=case`,
    })
  },

  onShare() {
    const { detail } = this.data
    if (!detail || !detail.id) return
    if (!canShareCase(detail)) {
      wx.showToast({ title: '案例脱敏内容未就绪，暂不可分享', icon: 'none' })
      return
    }
    copyCaseShareLink(detail.id, detail)
  },

  onShareAppMessage() {
    const payload = buildCaseSharePayload(this.data.detail)
    if (payload) return payload
    return {
      title: '辙见 · 公开案例',
      path: '/pages/case/index',
    }
  },

  onShareTimeline() {
    const { detail } = this.data
    const payload = buildCaseSharePayload(detail)
    if (!payload) {
      return { title: '辙见 · 公开案例' }
    }
    return {
      title: payload.title,
      query: `id=${detail.id}`,
      imageUrl: payload.imageUrl,
    }
  },

  onStoreTap(e) {
    if (!this.data.showStorePublicly) return
    const storeId = (e.detail && e.detail.storeId) || (this.data.detail && this.data.detail.storeId)
    if (!storeId) return
    wx.navigateTo({
      url: `/pages/store/detail/index?id=${storeId}`,
    })
  },

  onRelatedCaseTap(e) {
    const { caseId } = e.detail
    if (!caseId) return
    wx.navigateTo({ url: `/pages/case/detail/index?id=${caseId}` })
  },
})
