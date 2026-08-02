/**
 * 历史入口：审核通过后已不再经过本页；若仍打开则直接进门店选择。
 */
const { saveMerchantPlanAck } = require('../../../utils/merchant-plan-select')

Page({
  onLoad(options = {}) {
    const merchantId = options.merchantId || ''
    saveMerchantPlanAck(merchantId, 'free')
    wx.redirectTo({ url: '/packageMerchant/pages/store-picker/index' })
  },
})
