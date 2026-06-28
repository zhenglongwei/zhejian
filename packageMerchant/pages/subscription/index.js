const {
  fetchMerchantSubscriptionPanel,
  createSubscriptionOrder,
  prepaySubscriptionOrder,
  mockPaySubscriptionOrder,
} = require('../../../services/merchant-subscription')

function requestWechatPayment(payment) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      ...payment,
      success: resolve,
      fail: reject,
    })
  })
}

Page({
  data: {
    status: 'loading',
    subscription: null,
    plans: [],
    disclaimer: '',
    payingPlan: '',
    errorMessage: '',
  },

  onShow() {
    this.loadPanel()
  },

  async loadPanel() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const data = await fetchMerchantSubscriptionPanel()
      this.setData({
        status: 'normal',
        subscription: data.subscription,
        plans: data.plans || [],
        disclaimer: data.disclaimer || '',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onRetry() {
    this.loadPanel()
  },

  async onBuyPlan(e) {
    const plan = e.currentTarget.dataset.plan
    if (!plan || plan === 'free') return
    if (this.data.payingPlan) return

    this.setData({ payingPlan: plan })
    try {
      const order = await createSubscriptionOrder(plan)
      const prepay = await prepaySubscriptionOrder(order.orderId)
      if (prepay.mock) {
        await mockPaySubscriptionOrder(order.orderId)
        wx.showToast({ title: '开发环境已开通', icon: 'success' })
        await this.loadPanel()
        return
      }

      await requestWechatPayment(prepay.payment)
      wx.showToast({ title: '支付成功', icon: 'success' })
      await this.loadPanel()
    } catch (e) {
      const msg = (e && e.errMsg) || (e && e.message) || '支付未完成'
      if (!/cancel/i.test(msg)) {
        wx.showToast({ title: msg, icon: 'none' })
      }
    } finally {
      this.setData({ payingPlan: '' })
    }
  },
})
