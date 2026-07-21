const {
  PLAN_SELECT_HERO,
  PLAN_SELECT_SUMMARY,
  PLAN_SELECT_ROWS,
  PLAN_SELECT_FOOTER,
  PLAN_SELECT_CTA,
} = require('../../../constants/merchant-plan-select-copy')
const { saveMerchantPlanAck } = require('../../../utils/merchant-plan-select')
const { fetchMerchantProfile, MERCHANT_STATUS } = require('../../../services/merchant')
const {
  fetchMerchantSubscriptionPanel,
  createSubscriptionOrder,
} = require('../../../services/merchant-subscription')
const { AUTHORIZATION_CONSENT } = require('../../../constants/compliance-copy')

const STANDARD_PLAN_IDS = ['tool_480', 'index_99', 'optimize_299']

function buildSubscriptionPayConsent() {
  const item = AUTHORIZATION_CONSENT.subscription_pay
  return {
    authType: item.authType,
    authTextVersion: item.version,
    authTextSnapshot: item.text,
  }
}

function findStandardPlan(plans = []) {
  for (let i = 0; i < STANDARD_PLAN_IDS.length; i += 1) {
    const hit = (plans || []).find((p) => p.plan === STANDARD_PLAN_IDS[i])
    if (hit) return hit
  }
  return null
}

function isAlreadyOnStandard(subscription = {}) {
  return STANDARD_PLAN_IDS.includes(subscription.plan || '')
}

Page({
  data: {
    hero: PLAN_SELECT_HERO,
    summary: PLAN_SELECT_SUMMARY,
    rows: PLAN_SELECT_ROWS,
    footer: PLAN_SELECT_FOOTER,
    cta: PLAN_SELECT_CTA,
    merchantId: '',
    submitting: false,
    payConsent: false,
    payConsentBefore: '我已阅读并同意',
    payConsentLink: '《套餐与工具服务协议》',
    payConsentAfter: '，知晓服务内容、价格及到期规则',
    /** 后端已开通标准版/试用时，不再展示开通按钮 */
    alreadyActive: false,
    activeHint: '',
  },

  onLoad(options = {}) {
    this.setData({ merchantId: options.merchantId || '' })
    this.bootstrap()
  },

  async bootstrap() {
    await this.ensureApproved()
    await this.syncTrialState()
  },

  async ensureApproved() {
    try {
      const profile = await fetchMerchantProfile({
        merchantId: this.data.merchantId || undefined,
      })
      if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
        wx.showToast({ title: '请先完成入驻审核', icon: 'none' })
        setTimeout(() => {
          wx.redirectTo({ url: '/packageMerchant/pages/onboarding/index' })
        }, 600)
        return
      }
      if (profile.merchantId && profile.merchantId !== this.data.merchantId) {
        this.setData({ merchantId: profile.merchantId })
      }
    } catch (e) {
      /* ignore */
    }
  },

  async syncTrialState() {
    try {
      const panel = await fetchMerchantSubscriptionPanel()
      const subscription = (panel && panel.subscription) || {}
      if (isAlreadyOnStandard(subscription)) {
        const end = subscription.expiresAt
          ? String(subscription.expiresAt).slice(0, 10)
          : ''
        this.setData({
          alreadyActive: true,
          activeHint: end
            ? `试用已开通，有效期至 ${end}`
            : '试用已开通，可进入工作台继续使用',
          cta: '进入工作台',
        })
        saveMerchantPlanAck(this.data.merchantId, subscription.plan || 'tool_480')
      }
    } catch (e) {
      /* ignore：仍允许本地点确认，开通时再报错 */
    }
  },

  onTogglePayConsent() {
    this.setData({ payConsent: !this.data.payConsent })
  },

  onOpenAgreement() {
    wx.navigateTo({
      url: '/packageMerchant/pages/legal-document/index?type=subscription',
    })
  },

  async onConfirm() {
    if (this.data.submitting) return

    if (this.data.alreadyActive) {
      saveMerchantPlanAck(this.data.merchantId, 'tool_480')
      wx.redirectTo({ url: '/packageMerchant/pages/store-picker/index' })
      return
    }

    if (!this.data.payConsent) {
      wx.showToast({ title: '请先阅读并同意套餐协议', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const panel = await fetchMerchantSubscriptionPanel()
      const subscription = (panel && panel.subscription) || {}
      if (isAlreadyOnStandard(subscription)) {
        saveMerchantPlanAck(this.data.merchantId, subscription.plan || 'tool_480')
        wx.showToast({ title: '试用已开通', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({ url: '/packageMerchant/pages/store-picker/index' })
        }, 400)
        return
      }

      const standard = findStandardPlan((panel && panel.plans) || [])
      const planId = (standard && standard.plan) || 'index_99'
      await createSubscriptionOrder(planId, {
        intent: 'trial',
        subscriptionConsent: buildSubscriptionPayConsent(),
      })
      saveMerchantPlanAck(this.data.merchantId, planId)
      wx.showToast({ title: '已开始 90 天试用', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: '/packageMerchant/pages/store-picker/index' })
      }, 500)
    } catch (e) {
      wx.showToast({
        title: (e && e.message) || '开通试用失败，请稍后重试',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
