Page({
  onClose() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
      return
    }
    wx.redirectTo({ url: '/packageMerchant/pages/workbench/index' })
  },
})
