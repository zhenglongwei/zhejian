const {
  PLAN_SELECT_HERO,
  PLAN_SELECT_SUMMARY,
  PLAN_SELECT_ROWS,
  PLAN_SELECT_FOOTER,
  PLAN_SELECT_CTA,
} = require('../../../constants/merchant-plan-select-copy')
const { saveMerchantPlanAck } = require('../../../utils/merchant-plan-select')
const { fetchMerchantProfile, MERCHANT_STATUS } = require('../../../services/merchant')

Page({
  data: {
    hero: PLAN_SELECT_HERO,
    summary: PLAN_SELECT_SUMMARY,
    rows: PLAN_SELECT_ROWS,
    footer: PLAN_SELECT_FOOTER,
    cta: PLAN_SELECT_CTA,
    merchantId: '',
    submitting: false,
  },

  onLoad(options = {}) {
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
      /* ignore */
    }
  },

  onConfirm() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    saveMerchantPlanAck(this.data.merchantId, 'tool_480')
    wx.showToast({ title: '已开始试用', icon: 'success' })
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
