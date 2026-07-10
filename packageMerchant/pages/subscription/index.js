const {
  fetchMerchantSubscriptionPanel,
  createSubscriptionOrder,
  prepaySubscriptionOrder,
  mockPaySubscriptionOrder,
} = require('../../../services/merchant-subscription')
const { resolveMerchantPlanTier } = require('../../../constants/merchant-plan-tier')

// #region agent log
function agentLog(location, message, data, hypothesisId) {
  wx.request({
    url: 'http://127.0.0.1:7444/ingest/801a788a-6311-461e-a8c2-07503da5b635',
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'bddc5f',
    },
    data: {
      sessionId: 'bddc5f',
      runId: 'pre-fix',
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    },
    fail: () => {},
  })
}
// #endregion

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
      // #region agent log
      agentLog(
        'subscription/index.js:loadPanel',
        'panel loaded',
        {
          currentPlan: panel.subscription && panel.subscription.plan,
          publicIndex: panel.subscription && panel.subscription.publicIndex,
          plans: (panel.plans || []).map((p) => ({
            plan: p.plan,
            isCurrentPlan: p.isCurrentPlan,
            hasButton: p.plan !== 'free' && !p.isCurrentPlan,
            switchQuote: p.switchQuote
              ? {
                  isCurrentPlan: p.switchQuote.isCurrentPlan,
                  amountCents: p.switchQuote.amountCents,
                  summary: p.switchQuote.summary,
                }
              : null,
          })),
        },
        'B'
      )
      // #endregion
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
    // #region agent log
    agentLog(
      'subscription/index.js:onBuyPlan',
      'buy plan tapped',
      {
        plan,
        payingPlan: this.data.payingPlan,
        currentTargetDataset: (e.currentTarget && e.currentTarget.dataset) || {},
        targetDataset: (e.target && e.target.dataset) || {},
        detail: e.detail || {},
      },
      'A'
    )
    // #endregion
    if (!plan || plan === 'free') return
    if (this.data.payingPlan) return

    this.setData({ payingPlan: plan })
    try {
      const order = await createSubscriptionOrder(plan)
      // #region agent log
      agentLog(
        'subscription/index.js:onBuyPlan',
        'create order response',
        {
          plan,
          orderId: order && order.orderId,
          immediate: Boolean(order && order.immediate),
          amount: order && order.amount,
        },
        'C'
      )
      // #endregion
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
      // #region agent log
      agentLog(
        'subscription/index.js:onBuyPlan',
        'prepay response',
        {
          plan,
          orderId: order.orderId,
          immediate: Boolean(prepay && prepay.immediate),
          mock: Boolean(prepay && prepay.mock),
          hasPayment: Boolean(prepay && prepay.payment),
        },
        'D'
      )
      // #endregion
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
      // #region agent log
      agentLog(
        'subscription/index.js:onBuyPlan',
        'switch completed after payment',
        { plan, currentPlan: this.data.subscription && this.data.subscription.plan },
        'E'
      )
      // #endregion
    } catch (e) {
      const msg = (e && e.errMsg) || (e && e.message) || '支付未完成'
      // #region agent log
      agentLog(
        'subscription/index.js:onBuyPlan',
        'buy plan error',
        {
          plan,
          msg,
          code: e && e.code,
          status: e && e.status,
        },
        'C'
      )
      // #endregion
      if (!/cancel/i.test(msg)) {
        wx.showToast({ title: msg, icon: 'none' })
      }
    } finally {
      this.setData({ payingPlan: '' })
    }
  },
})
