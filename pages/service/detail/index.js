const { fetchServiceDetail } = require('../../../services/service')
const { findStore } = require('../../../services/store')
const { PRICE_MODE } = require('../../../constants/price-mode')
const { checkAuth } = require('../../../utils/auth')
const { loadFavoriteState, toggleFavorite } = require('../../../utils/favorite-toggle')

function buildBottomLeftActions(showCasesLink) {
  const actions = [{ key: 'call', type: 'secondary', text: '电话咨询' }]
  if (showCasesLink) {
    actions.push({ key: 'cases', type: 'ghost', text: '查看案例' })
  }
  return actions
}

Page({
  data: {
    status: 'loading',
    detail: null,
    storePhone: '',
    errorMessage: '',
    isAccident: false,
    showPriceFactors: false,
    showCasesLink: false,
    bookable: false,
    casesAnchor: 'cases-section',
    bottomLeftActions: buildBottomLeftActions(false),
    isFavorited: false,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'consult',
    pendingConsultAction: false,
    pendingFavoriteToggle: false,
  },

  onShow() {
    if (this.data.status === 'normal' && this.serviceId) {
      this.syncFavoriteState()
    }
  },

  syncFavoriteState() {
    this.baseLeftActions = buildBottomLeftActions(this.data.showCasesLink)
    return loadFavoriteState(this, {
      targetType: 'service',
      targetId: this.serviceId,
      baseLeftActions: this.baseLeftActions,
      showFavorite: true,
    })
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
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchServiceDetail(this.serviceId, { audience: 'user' })
      const store = detail.storeId ? findStore(detail.storeId) : null
      const showCasesLink =
        detail.priceMode === PRICE_MODE.ACCIDENT ||
        detail.priceMode === PRICE_MODE.RANGE ||
        detail.priceMode === PRICE_MODE.CONSULT
      this.setData({
        detail,
        storePhone: (store && store.phone) || '',
        isAccident: detail.priceMode === PRICE_MODE.ACCIDENT,
        showPriceFactors:
          detail.priceMode === PRICE_MODE.RANGE ||
          detail.priceMode === PRICE_MODE.CONSULT ||
          detail.priceMode === PRICE_MODE.ACCIDENT,
        showCasesLink,
        bookable: Boolean(detail.bookable),
        status: 'normal',
      })
      await this.syncFavoriteState()
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败，请重试',
      })
    }
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

  onCall() {
    const { storePhone } = this.data
    if (!storePhone) {
      wx.showToast({ title: '暂无门店电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: storePhone })
  },

  onBottomLeftAction(e) {
    const { key } = e.detail
    if (key === 'favorite') {
      toggleFavorite(this, {
        targetType: 'service',
        targetId: this.serviceId,
        baseLeftActions: buildBottomLeftActions(this.data.showCasesLink),
        showFavorite: true,
      })
      return
    }
    if (key === 'call') this.onCall()
    else if (key === 'cases') this.onViewCases()
  },

  onViewCases() {
    wx.pageScrollTo({ selector: `#${this.data.casesAnchor}`, duration: 300 })
  },

  ensureConsultAuth() {
    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      this.setData({
        loginSheetVisible: true,
        loginSheetMode: auth.reason === 'bindPhone' ? 'bindPhone' : 'auto',
        loginSheetBindContext: 'consult',
        pendingConsultAction: true,
      })
      return false
    }
    return true
  },

  onMessage() {
    const { detail, bookable } = this.data
    if (!detail || !bookable) return
    if (!this.ensureConsultAuth()) return
    wx.navigateTo({
      url: `/pages/consult/submit/index?serviceId=${detail.id}&storeId=${detail.storeId || ''}&sourcePage=service`,
    })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false, pendingConsultAction: false, pendingFavoriteToggle: false })
  },

  onLoginSheetSuccess() {
    const pendingFavorite = this.data.pendingFavoriteToggle
    const pendingConsult = this.data.pendingConsultAction
    this.setData({
      loginSheetVisible: false,
      pendingFavoriteToggle: false,
      pendingConsultAction: false,
    })
    if (pendingFavorite) {
      toggleFavorite(this, {
        targetType: 'service',
        targetId: this.serviceId,
        baseLeftActions: buildBottomLeftActions(this.data.showCasesLink),
        showFavorite: true,
      })
      return
    }
    if (!pendingConsult) {
      this.syncFavoriteState()
      return
    }
    const auth = checkAuth({ needPhone: true })
    if (auth.ok) {
      this.onMessage()
    }
  },
})
