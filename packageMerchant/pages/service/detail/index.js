const { fetchServiceDetail } = require('../../../../services/service')
const { SERVICE_STATUS } = require('../../../../constants/service')

Page({
  data: {
    status: 'loading',
    detail: null,
    errorMessage: '',
    isAccident: false,
    showPriceFactors: false,
    isDraft: false,
  },

  onLoad(options) {
    this.serviceId = options.id || ''
    if (!this.serviceId) {
      this.setData({ status: 'error', errorMessage: '服务方案不存在' })
      return
    }
    this.loadDetail()
  },

  async loadDetail() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchServiceDetail(this.serviceId, {
        audience: 'merchant',
      })
      this.setData({
        detail,
        isAccident: detail.priceMode === 'accident',
        showPriceFactors:
          detail.priceMode === 'range' ||
          detail.priceMode === 'consult' ||
          detail.priceMode === 'accident',
        isDraft: detail.status === SERVICE_STATUS.DRAFT,
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
    this.loadDetail()
  },

  onCaseTap(e) {
    const { caseId } = e.detail
    wx.navigateTo({ url: `/pages/case/detail/index?id=${caseId}` })
  },

  onManageCases() {
    wx.navigateTo({ url: '/packageMerchant/pages/album/list/index' })
  },

  onStoreTap(e) {
    const storeId = e.currentTarget.dataset.storeId
    if (!storeId) return
    wx.navigateTo({ url: `/pages/store/detail/index?id=${storeId}` })
  },

  onEdit() {
    wx.showToast({
      title: '编辑功能将在后续版本开放',
      icon: 'none',
    })
  },

  onBack() {
    wx.navigateBack()
  },
})
