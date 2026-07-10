const {
  fetchMerchantSubscriptionPanel,
  createSubscriptionOrder,
  prepaySubscriptionOrder,
  mockPaySubscriptionOrder,
} = require('../../../services/merchant-subscription')
const { resolveMerchantPlanTier } = require('../../../constants/merchant-plan-tier')
const { requestMerchantNotificationSubscribe } = require('../../../utils/subscribe-message')

const PLAN_RANK = { free: 0, index_99: 1 }

const GATE_BENEFITS = [
  '未开通：案例和门店页只能在微信里分享，百度等搜索引擎搜不到',
  '开通后：车主授权的案例和门店页，可被百度、微信搜一搜等收录',
  '付费不影响排序，案例越完整、车主反馈越好，越容易被人看到',
]

const PLAN_HIGHLIGHTS_FRIENDLY = {
  free: [
    '服务相册全功能，永久免费用',
    '车主扫码可看，微信里能分享',
    '工单记录一直保存',
  ],
  index_99: [
    '授权案例可被百度、微信搜一搜找到',
    '门店介绍页也能被搜索到',
    '首购免费试用 6 个月，之后 99 元/年',
    '含免费版全部功能',
  ],
}

function formatExpiresAt(iso) {
  if (!iso) return ''
  return String(iso).slice(0, 10)
}

function formatPlanPrice(item) {
  if (!item || item.plan === 'free') {
    return { amount: '0', suffix: '永久免费', note: '' }
  }
  if (item.trialEligible) {
    return {
      amount: '0',
      suffix: '首 6 个月',
      note: '试用结束后 99 元/年续费',
    }
  }
  const listYuan = ((item.listPriceCents || 0) / 100).toFixed(0)
  if (item.paymentTestMode) {
    return {
      amount: ((item.priceCents || 0) / 100).toFixed(2),
      suffix: '元 / 年',
      note: `标价 ¥${listYuan} · 联调测试价`,
    }
  }
  if (item.listPriceCents && item.listPriceCents !== item.priceCents) {
    const discounted = ((item.priceCents || 0) / 100).toFixed(0)
    return {
      amount: discounted,
      suffix: '元 / 年',
      note: `原价 ¥${listYuan} / 年`,
    }
  }
  return { amount: listYuan, suffix: '元 / 年', note: '' }
}

function buildPublicIndexTag(subscription = {}) {
  if (subscription.publicIndex) {
    return { variant: 'success', text: '可被搜索收录' }
  }
  return { variant: 'info', text: '仅微信内分享' }
}

function buildFounderHint(subscription = {}) {
  if (!subscription.founderFlag) return ''
  const discount = subscription.founderRenewDiscount
  if (discount && Number(discount) > 0 && Number(discount) < 1) {
    const pct = Math.round(Number(discount) * 100)
    return `样板店续费享 ${pct / 10} 折优惠`
  }
  return '样板店专属权益'
}

function buildCurrentHero(subscription = {}) {
  const tier = resolveMerchantPlanTier(subscription.plan || 'free')
  const tierLabel = subscription.tierLabel || tier.text
  const planLabel = subscription.planLabel || ''
  const isFree = subscription.plan === 'free' || !subscription.expiresAt
  let validityText = ''
  if (isFree) {
    validityText = '永久有效'
  } else if (subscription.expiresAtDisplay) {
    validityText = `有效期至 ${subscription.expiresAtDisplay}`
  }
  return {
    tier,
    tierLabel,
    planLabel,
    validityText,
    isFree,
    publicIndexTag: buildPublicIndexTag(subscription),
    founderHint: buildFounderHint(subscription),
  }
}

function resolvePlanSelectable(item, subscription = {}, planStatus = {}) {
  if (!item || planStatus.hasPendingChange) return false
  const currentPlan = subscription.plan || 'free'
  if (item.plan === currentPlan) return false
  const quote = item.switchQuote || {}
  if (quote.switchMode === 'downgrade_scheduled') return true
  if (quote.switchMode === 'upgrade' || quote.switchMode === 'purchase' || quote.switchMode === 'trial') {
    return true
  }
  return false
}

function resolveSelectionAction(selectedPlan, plans = [], subscription = {}) {
  if (!selectedPlan) return null
  const item = (plans || []).find((p) => p.plan === selectedPlan)
  if (!item) return null
  const quote = item.switchQuote || {}
  if (quote.switchMode === 'downgrade_scheduled') {
    return {
      type: 'schedule',
      plan: selectedPlan,
      label: `确认：到期后改为${item.tierLabel}`,
    }
  }
  if (quote.switchMode === 'trial') {
    return {
      type: 'trial',
      plan: selectedPlan,
      label: '免费试用 6 个月',
    }
  }
  if (quote.switchMode === 'upgrade' || quote.switchMode === 'purchase') {
    return {
      type: 'pay',
      plan: selectedPlan,
      label: item.plan === subscription.plan ? '支付续费一年' : `支付开通${item.tierLabel}`,
    }
  }
  return null
}

function decorateSubscriptionPlans(plans = [], subscription = {}, planStatus = {}) {
  const currentPlan = subscription.plan || 'free'
  const pendingPlan = subscription.pendingPlan || ''
  return (plans || []).map((item) => {
    const tier = resolveMerchantPlanTier(item.plan)
    const price = formatPlanPrice(item)
    const highlights =
      PLAN_HIGHLIGHTS_FRIENDLY[item.plan] || item.highlights || []
    return {
      ...item,
      tierLabel: tier.text,
      tier,
      highlights,
      isCurrentPlan: item.plan === currentPlan,
      isNextPlan: Boolean(pendingPlan && item.plan === pendingPlan),
      selectable: resolvePlanSelectable(item, subscription, planStatus),
      priceAmount: price.amount,
      priceSuffix: price.suffix,
      priceNote: price.note,
    }
  })
}

function decorateSubscriptionPanel(data = {}) {
  const subscription = data.subscription || {}
  const planStatus = data.planStatus || {}
  const currentPlan = subscription.plan || 'free'
  const tier =
    (subscription.planTag && subscription.planTag.text) ||
    resolveMerchantPlanTier(currentPlan).text
  const decoratedSubscription = {
    ...subscription,
    tierLabel: tier,
    expiresAtDisplay: formatExpiresAt(subscription.expiresAt),
    pendingEffectiveAtDisplay: formatExpiresAt(subscription.pendingEffectiveAt),
  }
  const plans = decorateSubscriptionPlans(
    data.plans,
    decoratedSubscription,
    planStatus
  )
  return {
    subscription: decoratedSubscription,
    planStatus,
    renewalNotice: data.renewalNotice || { show: false },
    currentHero: buildCurrentHero(decoratedSubscription),
    publicIndexTag: buildPublicIndexTag(decoratedSubscription),
    gateBenefits: GATE_BENEFITS,
    plans,
    paymentTestMode: Boolean(data.paymentTestMode),
  }
}

function findPlan(plans, plan) {
  return (plans || []).find((item) => item.plan === plan) || null
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

function confirmSchedule(item, subscription) {
  return new Promise((resolve) => {
    const endDate = subscription.expiresAtDisplay || '当前套餐结束日'
    wx.showModal({
      title: '确认到期后切换',
      content: [
        `当前「${subscription.tierLabel}」用到 ${endDate}。`,
        `到期后自动改为「${item.tierLabel}」，本期不退费。`,
        '之后若想改选其他套餐，需先取消本次预约。',
      ].join('\n'),
      confirmText: '确认',
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

function confirmCancelPending(subscription) {
  return new Promise((resolve) => {
    const nextLabel = subscription.pendingPlanLabel || '其他套餐'
    wx.showModal({
      title: '取消预约变更',
      content: `取消后，到期仍将保持「${subscription.tierLabel}」，不再改为「${nextLabel}」。`,
      confirmText: '确认取消',
      cancelText: '返回',
      success(res) {
        resolve(Boolean(res.confirm))
      },
      fail() {
        resolve(false)
      },
    })
  })
}

function confirmTrial(item) {
  return new Promise((resolve) => {
    wx.showModal({
      title: '确认免费试用',
      content: [
        `开通「${item.tierLabel}」公域收录权益。`,
        '首购享 6 个月免费试用，试用结束后需手动支付 99 元/年续费。',
        '不会自动扣款。',
      ].join('\n'),
      confirmText: '开始试用',
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

function confirmPay(item, subscription, actionType) {
  return new Promise((resolve) => {
    const quote = item.switchQuote || {}
    const payYuan =
      quote.listPriceCents > 0
        ? (quote.listPriceCents / 100).toFixed(2)
        : quote.payYuan || '0.00'
    const lines = []
    if (actionType === 'renew') {
      lines.push(`续费「${item.tierLabel}」一年`)
    } else {
      lines.push(`${subscription.tierLabel} → ${item.tierLabel}`)
      lines.push('支付后立即生效。')
    }
    if (quote.refundYuan && quote.refundYuan !== '0.00') {
      lines.push(`原套餐剩余费用退回 ¥${quote.refundYuan}`)
    }
    lines.push(`需支付 ¥${payYuan}`)
    if (quote.payYuan && quote.payYuan !== payYuan) {
      lines.push(`（联调实付 ¥${quote.payYuan}）`)
    }
    wx.showModal({
      title: actionType === 'renew' ? '确认续费' : '确认支付',
      content: lines.join('\n'),
      confirmText: '确认支付',
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
    planStatus: null,
    renewalNotice: null,
    currentHero: null,
    publicIndexTag: null,
    gateBenefits: [],
    plans: [],
    selectedPlan: '',
    selectionAction: null,
    paymentTestMode: false,
    paying: false,
    errorMessage: '',
  },

  onShow() {
    this.loadPanel()
  },

  async loadPanel() {
    this.setData({ status: 'loading', errorMessage: '', selectedPlan: '' })
    try {
      const data = await fetchMerchantSubscriptionPanel()
      const panel = decorateSubscriptionPanel(data)
      panel.selectedPlan = ''
      this.applyPanel(panel)
      this.setData({ status: 'normal', paying: false })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  applyPanel(panel) {
    const selectedPlan = panel.selectedPlan !== undefined ? panel.selectedPlan : this.data.selectedPlan
    const selectionAction = resolveSelectionAction(
      selectedPlan,
      panel.plans,
      panel.subscription
    )
    this.setData({
      subscription: panel.subscription,
      planStatus: panel.planStatus,
      renewalNotice: panel.renewalNotice,
      currentHero: panel.currentHero,
      publicIndexTag: panel.publicIndexTag,
      gateBenefits: panel.gateBenefits,
      plans: panel.plans,
      paymentTestMode: panel.paymentTestMode,
      selectedPlan,
      selectionAction,
    })
  },

  onRetry() {
    this.loadPanel()
  },

  onSelectPlan(e) {
    const plan = e.currentTarget.dataset.plan
    const item = findPlan(this.data.plans, plan)
    if (!item || !item.selectable || this.data.paying) return
    const selectedPlan = this.data.selectedPlan === plan ? '' : plan
    const selectionAction = resolveSelectionAction(
      selectedPlan,
      this.data.plans,
      this.data.subscription
    )
    this.setData({ selectedPlan, selectionAction })
  },

  async onCancelPending() {
    if (this.data.paying || !this.data.planStatus?.canCancelPending) return
    const confirmed = await confirmCancelPending(this.data.subscription)
    if (!confirmed) return
    await this.executeOrder(this.data.subscription.plan, 'cancel')
  },

  async onRenew() {
    if (this.data.paying || !this.data.renewalNotice?.canPay) return
    const item = findPlan(this.data.plans, this.data.subscription.plan)
    if (!item) return
    const confirmed = await confirmPay(item, this.data.subscription, 'renew')
    if (!confirmed) return
    await this.executeOrder(this.data.subscription.plan, 'renew')
  },

  async onConfirmSelection() {
    const action = this.data.selectionAction
    if (!action || this.data.paying) return
    const item = findPlan(this.data.plans, action.plan)
    if (!item) return

    if (action.type === 'schedule') {
      const confirmed = await confirmSchedule(item, this.data.subscription)
      if (!confirmed) return
      await this.executeOrder(action.plan, 'schedule')
      return
    }

    if (action.type === 'trial') {
      const confirmed = await confirmTrial(item)
      if (!confirmed) return
      await this.executeOrder(action.plan, 'trial')
      return
    }

    const confirmed = await confirmPay(item, this.data.subscription, 'pay')
    if (!confirmed) return
    await this.executeOrder(action.plan, 'pay')
  },

  async onSubscribeRenewNotice() {
    await requestMerchantNotificationSubscribe('subscription', { showToast: true })
  },

  async executeOrder(plan, kind) {
    if (!plan || this.data.paying) return

    this.setData({ paying: true })
    try {
      const order = await createSubscriptionOrder(plan)
      const target = findPlan(this.data.plans, plan)
      const endDate = this.data.subscription.expiresAtDisplay

      if (order.keptCurrent || kind === 'cancel') {
        wx.showToast({ title: '已取消预约变更', icon: 'success' })
        this.setData({ selectedPlan: '' })
        await this.loadPanel()
        return
      }

      if (order.scheduled || kind === 'schedule') {
        const tip = endDate
          ? `已登记，${endDate} 起改为${target ? target.tierLabel : '新套餐'}`
          : '已登记套餐变更'
        wx.showToast({ title: tip, icon: 'success' })
        this.setData({ selectedPlan: '' })
        await this.loadPanel()
        return
      }

      if (order.immediate) {
        const tip =
          kind === 'renew'
            ? '续费成功'
            : kind === 'trial' || order.trial
              ? '已开通 6 个月免费试用'
              : order.proration && Number(order.proration.refundExcessCents) > 0
                ? `已升级，原套餐剩余 ¥${order.proration.refundExcessYuan} 将原路退回`
                : '套餐已切换'
        wx.showToast({ title: tip, icon: 'success' })
        this.setData({ selectedPlan: '' })
        await this.loadPanel()
        return
      }

      const prepay = await prepaySubscriptionOrder(order.orderId)
      if (prepay.immediate) {
        wx.showToast({ title: kind === 'renew' ? '续费成功' : '套餐已切换', icon: 'success' })
        this.setData({ selectedPlan: '' })
        await this.loadPanel()
        return
      }
      if (prepay.mock) {
        await mockPaySubscriptionOrder(order.orderId)
        wx.showToast({
          title: kind === 'renew' ? '开发环境已续费' : '开发环境已开通',
          icon: 'success',
        })
        this.setData({ selectedPlan: '' })
        await this.loadPanel()
        return
      }

      await requestWechatPayment(prepay.payment)
      wx.showToast({ title: kind === 'renew' ? '续费成功' : '支付成功', icon: 'success' })
      this.setData({ selectedPlan: '' })
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
