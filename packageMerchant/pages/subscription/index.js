const {
  SUBSCRIPTION_COPY,
  SUBSCRIPTION_BENEFITS,
} = require('../../../constants/merchant-plan-select-copy')

Page({
  data: {
    amountLabel: SUBSCRIPTION_COPY.amountLabel,
    priceMark: SUBSCRIPTION_COPY.priceMark,
    benefitsTitle: SUBSCRIPTION_COPY.benefitsTitle,
    benefits: SUBSCRIPTION_BENEFITS,
    agreementLink: SUBSCRIPTION_COPY.agreementLink,
  },

  onOpenSubscriptionAgreement() {
    wx.navigateTo({
      url: '/packageMerchant/pages/legal-document/index?type=subscription',
    })
  },
})
