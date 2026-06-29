const {
  fetchMerchantSubscriptionPanel,
  createSubscriptionOrder,
  prepaySubscriptionOrder,
  mockPaySubscriptionOrder,
} = require('../../../services/merchant-subscription')
const { resolveMerchantPlanTier } = require('../../../constants/merchant-plan-tier')

function decorateSubscriptionPlans(plans = []) {
  return (plans || []).map((item) => {
    const tier = resolveMerchantPlanTier(item.plan)
    return {
      ...item,
      tierLabel: tier.text,
      isCurrentPlan: Boolean(item.switchQuote && item.switchQuote.isCurrentPlan),
    }
  })
}

function formatExpiresAt(iso) {
  if (!iso) return ''
  return String(iso).slice(0, 10)
}

function decorateSubscriptionPanel(data = {}) {
  const subscription = data.subscription || {}
  const tier =
    (subscription.planTag && subscription.planTag.text) ||
    resolveMerchantPlanTier(subscription.plan).text
  return {
    subscription: {
      ...subscription,
      tierLabel: tier,
      expiresAtDisplay: formatExpiresAt(subscription.expiresAt),
    },
    plans: decorateSubscriptionPlans(data.plans),
    paymentTestMode: Boolean(data.paymentTestMode),
    disclaimer: data.disclaimer || '',
  }
}

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
    paymentTestMode: false,
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
      const panel = decorateSubscriptionPanel(data)
      this.setData({
        status: 'normal',
        subscription: panel.subscription,
        plans: panel.plans,
        paymentTestMode: panel.paymentTestMode,
        disclaimer: panel.disclaimer,
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
      if (order.immediate) {
        const tip =
          order.proration && Number(order.proration.refundExcessCents) > 0
            ? `已切换，差额 ¥${order.proration.refundExcessYuan} 将原路退回`
            : '套餐已切换'
        wx.showToast({ title: tip, icon: 'success' })
        await this.loadPanel()
        return
      }

      const prepay = await prepaySubscriptionOrder(order.orderId)
      if (prepay.immediate) {
        wx.showToast({ title: '套餐已切换', icon: 'success' })
        await this.loadPanel()
        return
      }
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
