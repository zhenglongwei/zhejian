const { fetchMerchantOrderDetail } = require('../../../../services/merchant-order')
const { getMerchantDetailBottomActions } = require('../../../../utils/merchant-order-display')
const { handleMerchantOrderAction } = require('../../../../utils/merchant-order-actions')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    detail: null,
    bottomPrimary: null,
    bottomSecondary: null,
    showBottomBar: false,
  },

  onLoad(options) {
    this.orderId = options.id || ''
    if (!this.orderId) {
      this.setData({
        status: 'error',
        errorMessage: '订单不存在或已被删除。',
      })
      return
    }
  },

  onShow() {
    if (this.orderId) this.loadDetail()
  },

  async loadDetail() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchMerchantOrderDetail(this.orderId)
      const bottom = getMerchantDetailBottomActions(detail)
      this.setData({
        detail,
        bottomPrimary: bottom.primary,
        bottomSecondary: bottom.secondary,
        showBottomBar: Boolean(bottom.primary || bottom.secondary),
        status: 'normal',
      })
    } catch (e) {
      const code = e && e.code
      let message = (e && e.message) || '加载失败'
      if (code === 403) message = '你无权查看该订单。'
      if (code === 404) message = '订单不存在或已被删除。'
      this.setData({
        status: 'error',
        errorMessage: message,
        detail: null,
        showBottomBar: false,
      })
    }
  },

  refreshDetail(detail) {
    const bottom = getMerchantDetailBottomActions(detail)
    this.setData({
      detail,
      bottomPrimary: bottom.primary,
      bottomSecondary: bottom.secondary,
      showBottomBar: Boolean(bottom.primary || bottom.secondary),
      status: 'normal',
    })
  },

  onRetry() {
    this.loadDetail()
  },

  onBottomPrimary() {
    this.runAction(this.data.bottomPrimary)
  },

  onBottomSecondary() {
    this.runAction(this.data.bottomSecondary)
  },

  runAction(action) {
    if (!action || !this.data.detail) return
    handleMerchantOrderAction(action.actionKey, {
      order: this.data.detail,
      detail: this.data.detail,
      onRefresh: (d) => this.refreshDetail(d || this.data.detail),
    })
  },

  onAlbumEntry() {
    handleMerchantOrderAction('album', {
      order: this.data.detail,
      detail: this.data.detail,
    })
  },

  onCallUser() {
    handleMerchantOrderAction('callUser', {
      order: this.data.detail,
      detail: this.data.detail,
    })
  },

  onReschedule() {
    handleMerchantOrderAction('reschedule', {
      order: this.data.detail,
      detail: this.data.detail,
      onRefresh: (d) => this.refreshDetail(d),
    })
  },
})
