const { fetchGeoPageDetail } = require('../../../services/geo')
const {
  getGeoPageTypeLabel,
  isAccidentGeoPage,
  GEO_TOPIC_TAG,
} = require('../../../constants/geo-pages')

const FOOTER_TEXT =
  '页面内容用于展示维修服务信息、门店信息和脱敏案例，不构成平台报价或维修承诺。实际维修方案、费用、配件、质保和售后由用户与门店线下确认。'

const BOTTOM_LEFT_ACTIONS = [{ key: 'call', type: 'secondary', text: '电话咨询' }]

Page({
  data: {
    status: 'loading',
    detail: null,
    keyInfoRows: [],
    relatedCases: [],
    relatedStores: [],
    faqList: [],
    errorMessage: '',
    footerText: FOOTER_TEXT,
    showAccidentNotice: false,
    geoTopicTag: GEO_TOPIC_TAG,
    bottomLeftActions: BOTTOM_LEFT_ACTIONS,
    primaryStorePhone: '',
    bodyClearance: true,
  },

  onLoad(options) {
    this.pageId = (options && options.id) || ''
    if (!this.pageId) {
      this.setData({ status: 'error', errorMessage: '缺少专题 ID' })
      return
    }
    this.loadDetail(this.pageId)
  },

  async loadDetail(id) {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchGeoPageDetail(id)
      const navTitle =
        detail.title.length > 14 ? `${detail.title.slice(0, 14)}…` : detail.title
      wx.setNavigationBarTitle({ title: navTitle })
      const keyInfoRows = [
        { label: '城市', value: detail.city },
        { label: '专题类型', value: getGeoPageTypeLabel(detail.pageType) },
        { label: '相关案例', value: `${detail.relatedCaseCount} 条` },
        { label: '相关门店', value: `${detail.relatedStoreCount} 家` },
        { label: '更新时间', value: detail.updatedAt },
      ]
      const primaryStorePhone =
        (detail.primaryStore && detail.primaryStore.phone) || ''
      this.setData({
        detail,
        keyInfoRows,
        relatedCases: detail.relatedCases || [],
        relatedStores: detail.relatedStores || [],
        faqList: detail.faq || [],
        showAccidentNotice: isAccidentGeoPage(detail),
        primaryStorePhone,
        status: 'normal',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onRetry() {
    if (this.pageId) {
      this.loadDetail(this.pageId)
    }
  },

  onBottomLeftAction(e) {
    const { key } = e.detail
    if (key === 'call') this.onCall()
  },

  onCall() {
    const { primaryStorePhone } = this.data
    if (!primaryStorePhone) {
      wx.showToast({ title: '暂无门店电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: primaryStorePhone })
  },

  onMessage() {
    const { detail } = this.data
    const storeId =
      (detail && detail.primaryStoreId) ||
      (detail && detail.relatedStoreIds && detail.relatedStoreIds[0]) ||
      ''
    let url = `/pages/consult/submit/index?sourcePage=geo&geoId=${this.pageId}`
    if (storeId) url += `&storeId=${storeId}`
    if (detail && detail.relatedServiceId) {
      url += `&serviceId=${detail.relatedServiceId}`
    }
    wx.navigateTo({ url })
  },

  onCaseTap(e) {
    const { caseId } = e.detail
    wx.navigateTo({ url: `/pages/case/detail/index?id=${caseId}` })
  },

  onStoreTap(e) {
    const storeId = (e.detail && e.detail.storeId) || e.currentTarget.dataset.storeId
    if (!storeId) return
    wx.navigateTo({ url: `/pages/store/detail/index?id=${storeId}` })
  },
})
