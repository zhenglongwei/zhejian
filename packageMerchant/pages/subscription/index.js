const {
  fetchMerchantSubscriptionPanel,
  createSubscriptionOrder,
  prepaySubscriptionOrder,
  mockPaySubscriptionOrder,
} = require('../../../services/merchant-subscription')
const { resolveMerchantPlanTier } = require('../../../constants/merchant-plan-tier')
const {
  PLAN_SELECT_SUMMARY,
  PLAN_SELECT_ROWS,
  PLAN_SELECT_FOOTER,
  SUBSCRIPTION_COPY,
} = require('../../../constants/merchant-plan-select-copy')
const { requestMerchantNotificationSubscribe } = require('../../../utils/subscribe-message')
const { AUTHORIZATION_CONSENT } = require('../../../constants/compliance-copy')

const STANDARD_PLAN_IDS = ['tool_480', 'index_99', 'optimize_299']

function formatExpiresAt(iso) {
  if (!iso) return ''
  return String(iso).slice(0, 10)
}

function buildPublicIndexTag() {
  return { variant: 'success', text: '公开收录不另收费' }
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
    validityText = '试用期内'
  } else if (subscription.expiresAtDisplay) {
    validityText = `有效期至 ${subscription.expiresAtDisplay}`
  }
  return {
    tier,
    tierLabel,
    planLabel,
    validityText,
    isFree,
    publicIndexTag: buildPublicIndexTag(),
    founderHint: buildFounderHint(subscription),
  }
}

function findStandardPlan(plans = []) {
  for (let i = 0; i < STANDARD_PLAN_IDS.length; i += 1) {
    const hit = (plans || []).find((p) => p.plan === STANDARD_PLAN_IDS[i])
    if (hit) return hit
  }
  return null
}

function resolveItemTrialEligible(item, subscription = {}) {
  if (!item || !STANDARD_PLAN_IDS.includes(item.plan)) return false
  if (subscription.standardTrialUsed) return false
  if ((subscription.plan || 'free') !== 'free' || subscription.pendingPlan) return false
  return subscription.standardTrialEligible === true || item.trialEligible === true
}

function resolvePrimaryAction(plans = [], subscription = {}, planStatus = {}, renewalNotice = {}) {
  if (renewalNotice && renewalNotice.canPay) return null
  if (planStatus && planStatus.hasPendingChange) return null
  const item = findStandardPlan(plans)
  if (!item) return null

  const trialEligible = resolveItemTrialEligible(item, subscription)
  if (trialEligible) {
    return {
      type: 'trial',
      plan: item.plan,
      label: SUBSCRIPTION_COPY.trialCta,
    }
  }

  const currentPlan = subscription.plan || 'free'
  if (STANDARD_PLAN_IDS.includes(currentPlan)) return null

  const quote = item.switchQuote || {}
  if (quote.switchMode === 'upgrade' || quote.switchMode === 'purchase') {
    return {
      type: 'pay',
      plan: item.plan,
      label: SUBSCRIPTION_COPY.payCta,
    }
  }
  return null
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
    standardTrialEligible: subscription.standardTrialEligible === true,
  }
  const renewalNotice = data.renewalNotice || { show: false }
  const plans = data.plans || []
  return {
    subscription: decoratedSubscription,
    planStatus,
    renewalNotice,
    currentHero: buildCurrentHero(decoratedSubscription),
    publicIndexTag: buildPublicIndexTag(),
    plans,
    primaryAction: resolvePrimaryAction(
      plans,
      decoratedSubscription,
      planStatus,
      renewalNotice
    ),
    paymentTestMode: Boolean(data.paymentTestMode),
  }
}

function needsSubscriptionPayConsent(action, renewalNotice = {}) {
  if (renewalNotice && renewalNotice.canPay) return true
  if (!action) return false
  return action.type === 'pay' || action.type === 'trial'
}

function buildSubscriptionPayConsent() {
  const item = AUTHORIZATION_CONSENT.subscription_pay
  return {
    authType: item.authType,
    authTextVersion: item.version,
    authTextSnapshot: item.text,
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

function confirmTrial() {
  return new Promise((resolve) => {
    wx.showModal({
      title: SUBSCRIPTION_COPY.trialConfirmTitle,
      content: SUBSCRIPTION_COPY.trialConfirmLines.join('\n'),
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
        : quote.payYuan || '480.00'
    const lines = []
    if (actionType === 'renew') {
      lines.push('续费「标准版」一年')
    } else {
      lines.push('开通「标准版」')
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
    folioHint: SUBSCRIPTION_COPY.folioHint,
    agreementLink: SUBSCRIPTION_COPY.agreementLink,
    renewCta: SUBSCRIPTION_COPY.renewCta,
    planSummary: PLAN_SELECT_SUMMARY,
    planRows: PLAN_SELECT_ROWS,
    planFooter: PLAN_SELECT_FOOTER,
    plans: [],
    primaryAction: null,
    paymentTestMode: false,
    paying: false,
    errorMessage: '',
    payConsent: false,
    payConsentText: AUTHORIZATION_CONSENT.subscription_pay.text,
    showPayConsent: false,
  },

  onShow() {
    this.loadPanel()
  },

  async loadPanel() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const data = await fetchMerchantSubscriptionPanel()
      const panel = decorateSubscriptionPanel(data)
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
    this.setData({
      subscription: panel.subscription,
      planStatus: panel.planStatus,
      renewalNotice: panel.renewalNotice,
      currentHero: panel.currentHero,
      publicIndexTag: panel.publicIndexTag,
      plans: panel.plans,
      primaryAction: panel.primaryAction,
      paymentTestMode: panel.paymentTestMode,
      showPayConsent: needsSubscriptionPayConsent(panel.primaryAction, panel.renewalNotice),
      payConsent: false,
    })
  },

  onTogglePayConsent() {
    this.setData({ payConsent: !this.data.payConsent })
  },

  onOpenSubscriptionAgreement() {
    wx.navigateTo({
      url: '/packageMerchant/pages/legal-document/index?type=subscription',
    })
  },

  ensurePayConsent() {
    if (!this.data.showPayConsent && !this.data.renewalNotice?.canPay) return true
    if (this.data.payConsent) return true
    wx.showToast({ title: '请先阅读并同意套餐协议', icon: 'none' })
    return false
  },

  onRetry() {
    this.loadPanel()
  },

  async onCancelPending() {
    if (this.data.paying || !this.data.planStatus?.canCancelPending) return
    const confirmed = await confirmCancelPending(this.data.subscription)
    if (!confirmed) return
    await this.executeOrder(this.data.subscription.plan, 'cancel')
  },

  async onRenew() {
    if (this.data.paying || !this.data.renewalNotice?.canPay) return
    if (!this.ensurePayConsent()) return
    const item =
      findPlan(this.data.plans, this.data.subscription.plan) ||
      findStandardPlan(this.data.plans)
    if (!item) return
    const confirmed = await confirmPay(item, this.data.subscription, 'renew')
    if (!confirmed) return
    await this.executeOrder(item.plan, 'renew')
  },

  async onConfirmPrimary() {
    const action = this.data.primaryAction
    if (!action || this.data.paying) return
    const item = findPlan(this.data.plans, action.plan)
    if (!item) return

    if (action.type === 'trial') {
      if (!this.ensurePayConsent()) return
      const confirmed = await confirmTrial()
      if (!confirmed) return
      await this.executeOrder(action.plan, 'trial')
      return
    }

    if (!this.ensurePayConsent()) return
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
      const orderOptions = kind === 'trial' ? { intent: 'trial' } : {}
      const needsConsent = kind === 'pay' || kind === 'trial' || kind === 'renew'
      if (needsConsent) {
        orderOptions.subscriptionConsent = buildSubscriptionPayConsent()
      }
      const order = await createSubscriptionOrder(plan, orderOptions)

      if (order.keptCurrent || kind === 'cancel') {
        wx.showToast({ title: '已取消预约变更', icon: 'success' })
        await this.loadPanel()
        return
      }

      if (order.scheduled || kind === 'schedule') {
        wx.showToast({ title: '已登记套餐变更', icon: 'success' })
        await this.loadPanel()
        return
      }

      if (order.immediate || order.trial || order.amount === 0) {
        const tip =
          kind === 'renew'
            ? '续费成功'
            : kind === 'trial' || order.trial
              ? '已开始 90 天免费试用'
              : '套餐已开通'
        wx.showToast({ title: tip, icon: 'success' })
        await this.loadPanel()
        return
      }

      if (kind === 'trial') {
        wx.showToast({
          title: '试用开通失败，请稍后重试',
          icon: 'none',
        })
        return
      }

      const prepay = await prepaySubscriptionOrder(order.orderId)
      if (prepay.immediate) {
        wx.showToast({ title: kind === 'renew' ? '续费成功' : '套餐已开通', icon: 'success' })
        await this.loadPanel()
        return
      }
      if (prepay.mock) {
        await mockPaySubscriptionOrder(order.orderId)
        wx.showToast({
          title: kind === 'renew' ? '开发环境已续费' : '开发环境已开通',
          icon: 'success',
        })
        await this.loadPanel()
        return
      }

      await requestWechatPayment(prepay.payment)
      wx.showToast({ title: kind === 'renew' ? '续费成功' : '支付成功', icon: 'success' })
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
