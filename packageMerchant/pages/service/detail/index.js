const {
  fetchServiceDetail,
  publishServicePlan,
  unpublishServicePlan,
} = require('../../../../services/service')

const BANNER_TEXT = {
  draft: '当前为草稿，保存并上架后用户端可见',
  approved: '未上架，点击「上架」后用户端可见',
  published: '已上架，用户端可见（预览）',
  suspended: '平台已强制下架，请联系运营或修改后重新申请',
}

Page({
  data: {
    status: 'loading',
    detail: null,
    errorMessage: '',
    isAccident: false,
    showPriceFactors: false,
    bannerText: '',
    showPublish: false,
    showUnpublish: false,
    showEdit: false,
    actionLoading: false,
  },

  onLoad(options) {
    this.serviceId = options.id || ''
    if (!this.serviceId) {
      this.setData({ status: 'error', errorMessage: '服务方案不存在' })
      return
    }
    this.loadDetail()
  },

  onShow() {
    if (this.serviceId && this.data.detail) {
      this.loadDetail()
    }
  },

  async loadDetail() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchServiceDetail(this.serviceId, {
        audience: 'merchant',
      })
      const st = detail.status
      const bannerKey =
        st === 'published'
          ? 'published'
          : st === 'suspended'
            ? 'suspended'
            : st === 'approved'
              ? 'approved'
              : 'draft'
      this.setData({
        detail,
        isAccident: detail.priceMode === 'accident',
        showPriceFactors:
          detail.priceMode === 'range' ||
          detail.priceMode === 'consult' ||
          detail.priceMode === 'accident',
        bannerText:
          st === 'suspended' && detail.rejectReason
            ? `${BANNER_TEXT.suspended}（${detail.rejectReason}）`
            : BANNER_TEXT[bannerKey] || '用户端不可见',
        showPublish: detail.canPublish,
        showUnpublish: detail.canUnpublish,
        showEdit: detail.editable,
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
    wx.navigateTo({
      url: `/packageMerchant/pages/service/create/index?id=${this.serviceId}`,
    })
  },

  async onPublish() {
    if (this.data.actionLoading) return
    this.setData({ actionLoading: true })
    try {
      await publishServicePlan(this.serviceId)
      wx.showToast({ title: '已上架', icon: 'success' })
      this.loadDetail()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '上架失败', icon: 'none' })
    } finally {
      this.setData({ actionLoading: false })
    }
  },

  async onUnpublish() {
    if (this.data.actionLoading) return
    const res = await wx.showModal({
      title: '确认下架',
      content: '下架后用户端将不再展示该服务方案',
    })
    if (!res.confirm) return
    this.setData({ actionLoading: true })
    try {
      await unpublishServicePlan(this.serviceId)
      wx.showToast({ title: '已下架', icon: 'success' })
      this.loadDetail()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '下架失败', icon: 'none' })
    } finally {
      this.setData({ actionLoading: false })
    }
  },

  onBack() {
    wx.navigateBack()
  },
})
