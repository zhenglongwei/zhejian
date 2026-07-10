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
      isPendingPlan: Boolean(item.switchQuote && item.switchQuote.isPendingPlan),
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
      pendingEffectiveAtDisplay: formatExpiresAt(subscription.pendingEffectiveAt),
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
  const quote = (selected && selected.switchQuote) || {}
  const isCurrent = Boolean(quote.isCurrentPlan)
  const isPending = Boolean(quote.isPendingPlan)
  const switchMode = quote.switchMode || ''

  let actionLabel = '确认切换'
  if (isCurrent) {
    actionLabel = '当前方案'
  } else if (isPending) {
    actionLabel = '已预约'
  } else if (switchMode === 'downgrade_scheduled') {
    actionLabel = '预约到期切换'
  } else if (switchMode === 'upgrade') {
    actionLabel = '确认升级并支付'
  } else if (selectedPlan === 'free') {
    actionLabel = '预约降级'
  } else if (subscription && subscription.publicIndex) {
    actionLabel = '确认切换'
  } else {
    actionLabel = '立即开通'
  }

  return {
    selectedQuoteSummary: quote.summary || '',
    selectedPriceLabel: (selected && selected.priceLabel) || '',
    selectedRefundYuan: quote.refundYuan || '',
    selectedPayYuan:
      quote.listPriceCents > 0
        ? (quote.listPriceCents / 100).toFixed(2)
        : quote.payYuan || '',
    selectedSwitchMode: switchMode,
    showFeeBreakdown:
      switchMode === 'upgrade' &&
      !isCurrent &&
      (Number(quote.refundCents) > 0 || Number(quote.listPriceCents) > 0),
    actionDisabled: isCurrent || isPending || !selectedPlan,
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

function confirmScheduledDowngrade(planLabel) {
  return new Promise((resolve) => {
    wx.showModal({
      title: '预约到期切换',
      content: `切换为${planLabel}后，本期剩余时间不退费；公域收录将在当前有效期结束后关闭或变更。`,
      confirmText: '确认预约',
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
    selectedRefundYuan: '',
    selectedPayYuan: '',
    selectedSwitchMode: '',
    showFeeBreakdown: false,
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

    if (this.data.selectedSwitchMode === 'downgrade_scheduled') {
      const selected = findPlan(this.data.plans, plan)
      const label = (selected && selected.tierLabel) || '目标方案'
      const confirmed = await confirmScheduledDowngrade(label)
      if (!confirmed) return
      await this.executeSwitch(plan)
      return
    }

    await this.executeSwitch(plan)
  },

  async executeSwitch(plan) {
    if (!plan || this.data.paying) return

    this.setData({ paying: true })
    try {
      const order = await createSubscriptionOrder(plan)

      if (order.scheduled) {
        wx.showToast({ title: '已预约到期切换', icon: 'success' })
        await this.loadPanel()
        return
      }

      if (order.immediate) {
        const tip =
          order.proration && Number(order.proration.refundExcessCents) > 0
            ? `已升级，原方案剩余 ¥${order.proration.refundExcessYuan} 将原路退回`
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
        const refundTip =
          order.proration && Number(order.proration.refundExcessCents) > 0
            ? `已升级，原方案剩余 ¥${order.proration.refundExcessYuan} 将原路退回`
            : '开发环境已开通'
        wx.showToast({ title: refundTip, icon: 'success' })
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
