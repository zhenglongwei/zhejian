const { fetchCaseDetail } = require('../../../services/case')
const {
  buildPublicCaseSharePayload,
  copyPublicCaseWebLink,
} = require('../../../utils/case-share')

const BOTTOM_LEFT_ACTIONS = [
  { key: 'share', type: 'secondary', text: '分享' },
  { key: 'call', type: 'secondary', text: '电话咨询' },
]

function buildShareCaseFromDetail(detail = {}) {
  if (!detail || !detail.id) return null
  return {
    id: detail.id,
    title: detail.title,
    serviceName: detail.serviceName,
    storeName: detail.storeName,
    coverImage: detail.coverImage,
    coverImageDesensitized: detail.coverImageDesensitized || detail.coverImage,
    nodes: detail.nodes,
  }
}

Page({
  data: {
    status: 'loading',
    detail: null,
    errorMessage: '',
    relatedCases: [],
    faqList: [],
    showStorePublicly: true,
    bottomLeftActions: BOTTOM_LEFT_ACTIONS,
    shareSheetVisible: false,
    shareSheetIntent: 'publicCase',
    shareActionsDisabled: false,
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
      this.updateShareMenu(true)
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
      this.updateShareMenu(false)
    }
  },

  onRetry() {
    this.loadDetail()
  },

  onBottomLeftAction(e) {
    const { key } = e.detail
    if (key === 'call') this.onCall()
    if (key === 'share') this.onOpenShareSheet()
  },

  onOpenShareSheet() {
    this.setData({ shareSheetVisible: true })
  },

  onCloseShareSheet() {
    this.setData({ shareSheetVisible: false })
  },

  onShareTimelineGuide() {
    this.setData({ shareSheetVisible: false })
    wx.showModal({
      title: '分享到朋友圈',
      content: '内容已准备好。请点击右上角 ···，选择「分享到朋友圈」。',
      showCancel: false,
      confirmText: '知道了',
    })
  },

  async onCopyPublicWebLink() {
    const shareCase = buildShareCaseFromDetail(this.data.detail)
    if (!shareCase || !shareCase.id) {
      wx.showToast({ title: '案例信息缺失', icon: 'none' })
      return
    }
    try {
      await copyPublicCaseWebLink(shareCase.id, shareCase)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '复制失败', icon: 'none' })
    }
  },

  updateShareMenu(ready) {
    if (ready) {
      wx.showShareMenu({
        withShareTicket: false,
        menus: ['shareAppMessage', 'shareTimeline'],
      })
    } else {
      wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    }
  },

  onShareAppMessage() {
    const shareCase = buildShareCaseFromDetail(this.data.detail)
    const payload = buildPublicCaseSharePayload(shareCase)
    if (payload) return payload
    return {
      title: '辙见 · 公开案例',
      path: `/pages/case/detail/index?id=${this.caseId}`,
    }
  },

  onShareTimeline() {
    const shareCase = buildShareCaseFromDetail(this.data.detail)
    const payload = buildPublicCaseSharePayload(shareCase)
    return {
      title: payload?.title || '辙见 · 公开案例',
      query: `id=${encodeURIComponent(this.caseId)}`,
    }
  },

  onCopyUrl() {
    if (this.caseId) {
      return { query: `id=${encodeURIComponent(this.caseId)}` }
    }
    return { query: '' }
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
