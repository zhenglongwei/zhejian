const {
  PLAN_SELECT_SUMMARY,
  PLAN_SELECT_ROWS,
  PLAN_SELECT_FOOTER,
  SUBSCRIPTION_COPY,
} = require('../../../constants/merchant-plan-select-copy')
const { fetchMerchantSubscriptionPanel } = require('../../../services/merchant-subscription')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    folioTitle: SUBSCRIPTION_COPY.folioTitle,
    folioTag: SUBSCRIPTION_COPY.folioTag,
    currentStatus: SUBSCRIPTION_COPY.currentStatus,
    planSummary: PLAN_SELECT_SUMMARY,
    planRows: PLAN_SELECT_ROWS,
    planFooter: PLAN_SELECT_FOOTER,
    agreementLink: SUBSCRIPTION_COPY.agreementLink,
  },

  onShow() {
    this.loadPanel()
  },

  async loadPanel() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      await fetchMerchantSubscriptionPanel()
      this.setData({ status: 'normal' })
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

  onOpenSubscriptionAgreement() {
    wx.navigateTo({
      url: '/packageMerchant/pages/legal-document/index?type=subscription',
    })
  },
})
