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

function findPlan(plans, plan) {
  return (plans || []).find((item) => item.plan === plan) || null
}

function resolveSelectionState(subscription, plans, selectedPlan) {
  const selected = findPlan(plans, selectedPlan)
  const isCurrent = Boolean(selected && selected.isCurrentPlan)
  const quote = (selected && selected.switchQuote) || {}
  let actionLabel = '确认切换'
  if (isCurrent) {
    actionLabel = '当前方案'
  } else if (selectedPlan === 'free') {
    actionLabel = '降级为基础版'
  } else if (subscription && subscription.publicIndex) {
    actionLabel = '确认切换'
  } else {
    actionLabel = '立即开通'
  }
  return {
    selectedQuoteSummary: quote.summary || '',
    selectedPriceLabel: (selected && selected.priceLabel) || '',
    actionDisabled: isCurrent || !selectedPlan,
    actionLabel,
    isCurrentSelection: isCurrent,
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

function confirmDowngradeToFree() {
  return new Promise((resolve) => {
    wx.showModal({
      title: '降级为基础版',
      content:
        '切换后公域收录将关闭，已发布案例不再进入 sitemap。剩余年费将按天折算原路退回（如有）。',
      confirmText: '确认降级',
      cancelText: '取消',
      success(res) {
        resolve(Boolean(res.confirm))
      },
      fail() {
        resolve(false)
      },
    })
  })
}

Page({
  data: {
    status: 'loading',
    subscription: null,
    plans: [],
    selectedPlan: '',
    paymentTestMode: false,
    disclaimer: '',
    paying: false,
    errorMessage: '',
    selectedQuoteSummary: '',
    selectedPriceLabel: '',
    actionDisabled: true,
    actionLabel: '当前方案',
    isCurrentSelection: true,
  },

  onShow() {
    this.loadPanel()
  },

  applySelectionState(selectedPlan) {
    const selection = resolveSelectionState(
      this.data.subscription,
      this.data.plans,
      selectedPlan
    )
    const plans = (this.data.plans || []).map((item) => ({
      ...item,
      isSelected: item.plan === selectedPlan,
    }))
    this.setData({
      selectedPlan,
      plans,
      ...selection,
    })
  },

  async loadPanel() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const data = await fetchMerchantSubscriptionPanel()
      const panel = decorateSubscriptionPanel(data)
      const selectedPlan = panel.subscription.plan || 'free'
      const selection = resolveSelectionState(
        panel.subscription,
        panel.plans,
        selectedPlan
      )
      const plans = panel.plans.map((item) => ({
        ...item,
        isSelected: item.plan === selectedPlan,
      }))
      this.setData({
        status: 'normal',
        subscription: panel.subscription,
        plans,
        selectedPlan,
        paymentTestMode: panel.paymentTestMode,
        disclaimer: panel.disclaimer,
        ...selection,
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

  onSelectPlan(e) {
    const plan = e.currentTarget.dataset.plan
    if (!plan || plan === this.data.selectedPlan) return
    this.applySelectionState(plan)
  },

  async onConfirmSwitch() {
    const plan = this.data.selectedPlan
    if (!plan || this.data.actionDisabled || this.data.paying) return

    if (plan === 'free' && this.data.subscription && this.data.subscription.publicIndex) {
      const confirmed = await confirmDowngradeToFree()
      if (!confirmed) return
    }

    await this.executeSwitch(plan)
  },

  async executeSwitch(plan) {
    if (!plan || this.data.paying) return

    this.setData({ paying: true })
    try {
      const order = await createSubscriptionOrder(plan)
      if (order.immediate) {
        const tip =
          order.proration && Number(order.proration.refundExcessCents) > 0
            ? `已切换，差额 ¥${order.proration.refundExcessYuan} 将原路退回`
            : plan === 'free'
              ? '已切换为基础版'
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
      const msg = (e && e.errMsg) || (e && e.message) || '操作未完成'
      if (!/cancel/i.test(msg)) {
        wx.showToast({ title: msg, icon: 'none' })
      }
    } finally {
      this.setData({ paying: false })
    }
  },
})
