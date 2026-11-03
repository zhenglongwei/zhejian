const { isMerchantOwner } = require('../../../utils/auth')
const {
  fetchMerchantSubscriptionPanel,
  createSubscriptionOrder,
  prepaySubscriptionOrder,
  mockPaySubscriptionOrder,
} = require('../../../services/merchant-subscription')
const {
  buildPricingTableFromColumns,
  DEFAULT_PLAN_COLUMNS,
} = require('../../../constants/merchant-plan-catalog')
const { AUTHORIZATION_CONSENT } = require('../../../constants/compliance-copy')

const CONSENT = AUTHORIZATION_CONSENT.subscription_pay

function actionForColumn(col, quotesByPlan, effectivePlan) {
  const quote = quotesByPlan[col.planCode]
  if (!quote) {
    return { actionLabel: '开通', actionDisabled: false, switchMode: 'purchase' }
  }
  if (quote.switchMode === 'current' || quote.isCurrentPlan) {
    return { actionLabel: '当前', actionDisabled: true, switchMode: 'current' }
  }
  if (quote.switchMode === 'renew') {
    return { actionLabel: '续费', actionDisabled: false, switchMode: 'renew' }
  }
  if (quote.switchMode === 'blocked_quota_upgrade_only') {
    return {
      actionLabel: '请升级',
      actionDisabled: true,
      switchMode: 'blocked_quota_upgrade_only',
    }
  }
  if (quote.switchMode === 'downgrade_scheduled') {
    return {
      actionLabel: quote.isPendingPlan ? '已预约' : '到期切换',
      actionDisabled: Boolean(quote.isPendingPlan),
      switchMode: 'downgrade_scheduled',
    }
  }
  if (quote.switchMode === 'upgrade') {
    return { actionLabel: '升级', actionDisabled: false, switchMode: 'upgrade' }
  }
  if (col.planCode === effectivePlan) {
    return { actionLabel: '当前', actionDisabled: true, switchMode: 'current' }
  }
  return { actionLabel: '开通', actionDisabled: false, switchMode: 'purchase' }
}

Page({
  data: {
    loading: true,
    columns: [],
    canPay: false,
    quotaLine: '',
    consentChecked: false,
    consentText: CONSENT.text,
    agreementLink: '查看《商家工具服务协议》',
    paying: false,
  },

  onShow() {
    this.loadPanel()
  },

  async loadPanel() {
    this.setData({ loading: true })
    const canPay = isMerchantOwner()
    try {
      const panel = await fetchMerchantSubscriptionPanel()
      const table =
        panel && panel.pricingTable && Array.isArray(panel.pricingTable.columns)
          ? panel.pricingTable
          : buildPricingTableFromColumns(
              panel && panel.planColumns && panel.planColumns.length
                ? panel.planColumns
                : DEFAULT_PLAN_COLUMNS,
              (panel && panel.effectivePlan) ||
                (panel && panel.subscription && panel.subscription.effectivePlan) ||
                '',
            )
      const quotesByPlan = {}
      ;(panel.plans || []).forEach((p) => {
        if (p && p.plan) quotesByPlan[p.plan] = p.switchQuote || null
      })
      const effectivePlan =
        panel.effectivePlan ||
        (panel.subscription && panel.subscription.effectivePlan) ||
        'taste'
      const columns = (table.columns || []).map((col) => ({
        ...col,
        ...actionForColumn(col, quotesByPlan, effectivePlan),
      }))
      const usedAi = panel.usedAiQuota != null ? panel.usedAiQuota : 0
      const aiLimit = panel.aiQuotaLimit != null ? panel.aiQuotaLimit : 3
      const usedHost =
        panel.usedPublicHostQuota != null ? panel.usedPublicHostQuota : 0
      const hostLimit =
        panel.publicHostQuotaLimit != null ? panel.publicHostQuotaLimit : 3
      this.setData({
        columns,
        canPay,
        quotaLine: `AI ${usedAi}/${aiLimit} · 公开托管 ${usedHost}/${hostLimit}`,
        loading: false,
        wechatPayConfigured: Boolean(panel.wechatPayConfigured),
        paymentTestMode: Boolean(panel.paymentTestMode),
      })
    } catch (err) {
      const table = buildPricingTableFromColumns(DEFAULT_PLAN_COLUMNS)
      this.setData({
        columns: (table.columns || []).map((col) => ({
          ...col,
          actionLabel: canPay ? '开通' : '',
          actionDisabled: false,
        })),
        canPay,
        quotaLine: '',
        loading: false,
      })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    }
  },

  onToggleConsent() {
    this.setData({ consentChecked: !this.data.consentChecked })
  },

  onOpenSubscriptionAgreement() {
    wx.navigateTo({
      url: '/packageMerchant/pages/legal-document/index?type=subscription',
    })
  },

  async onPlanAction(e) {
    if (!this.data.canPay || this.data.paying) return
    const plan = e.currentTarget.dataset.plan
    const disabled = e.currentTarget.dataset.disabled
    if (!plan || disabled === true || disabled === 'true') return

    if (!this.data.consentChecked) {
      wx.showToast({ title: '请先勾选同意协议', icon: 'none' })
      return
    }

    this.setData({ paying: true })
    try {
      const order = await createSubscriptionOrder(plan, {
        subscriptionConsent: {
          authType: CONSENT.authType,
          authTextVersion: CONSENT.version,
          authTextSnapshot: CONSENT.text,
        },
      })

      if (order.scheduled || order.immediate || order.keptCurrent) {
        wx.showToast({
          title: (order.proration && order.proration.summary) || '已处理',
          icon: 'none',
        })
        await this.loadPanel()
        return
      }

      if (!order.orderId) {
        wx.showToast({ title: '下单失败', icon: 'none' })
        return
      }

      const prepay = await prepaySubscriptionOrder(order.orderId)
      if (prepay.immediate) {
        wx.showToast({ title: '已开通', icon: 'success' })
        await this.loadPanel()
        return
      }

      if (prepay.mock) {
        await mockPaySubscriptionOrder(order.orderId)
        wx.showToast({ title: '联调已开通', icon: 'success' })
        await this.loadPanel()
        return
      }

      const payment = prepay.payment
      if (!payment) {
        wx.showToast({ title: '无法拉起支付', icon: 'none' })
        return
      }

      await new Promise((resolve, reject) => {
        wx.requestPayment({
          ...payment,
          success: resolve,
          fail: reject,
        })
      })
      wx.showToast({ title: '支付成功', icon: 'success' })
      await this.loadPanel()
    } catch (err) {
      const msg =
        (err && err.errMsg && String(err.errMsg).indexOf('cancel') >= 0
          ? '已取消支付'
          : null) ||
        (err && err.message) ||
        '支付失败'
      wx.showToast({ title: msg, icon: 'none' })
    } finally {
      this.setData({ paying: false })
    }
  },
})
