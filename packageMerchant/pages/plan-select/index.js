const {
  PLAN_SELECT_HERO,
  PLAN_SELECT_POSITIONING,
  PLAN_SELECT_OPTIONS,
  PLAN_SELECT_FOOTER,
} = require('../../../constants/merchant-plan-select-copy')
const { saveMerchantPlanAck } = require('../../../utils/merchant-plan-select')
const { fetchMerchantProfile, MERCHANT_STATUS } = require('../../../services/merchant')

Page({
  data: {
    hero: PLAN_SELECT_HERO,
    positioning: PLAN_SELECT_POSITIONING,
    options: PLAN_SELECT_OPTIONS,
    footer: PLAN_SELECT_FOOTER,
    selectedId: 'tool_480',
    merchantId: '',
    submitting: false,
  },

  onLoad(options = {}) {
    this.from = options.from || ''
    this.setData({ merchantId: options.merchantId || '' })
    this.ensureApproved()
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
      /* 无档案时仍允许看说明，确认时再拦 */
    }
  },

  onSelect(e) {
    const { id } = e.currentTarget.dataset
    if (!id || id === this.data.selectedId) return
    this.setData({ selectedId: id })
  },

  onConfirm() {
    if (this.data.submitting) return
    const planId = this.data.selectedId || 'free'
    this.setData({ submitting: true })
    saveMerchantPlanAck(this.data.merchantId, planId)
    const tip =
      planId === 'tool_480'
        ? '已选专业版：验证期可先试用，支付通道开放后再开通'
        : '已选体验版，可进入工作台'
    wx.showToast({ title: tip, icon: 'none', duration: 2200 })
    setTimeout(() => {
      this.setData({ submitting: false })
      wx.redirectTo({ url: '/packageMerchant/pages/store-picker/index' })
    }, 500)
  },

  onOpenAgreement() {
    wx.navigateTo({
      url: '/packageMerchant/pages/legal-document/index?type=subscription',
    })
  },
})
