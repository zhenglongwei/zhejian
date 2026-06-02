const { REPORT_SUCCESS_MESSAGE } = require('../../../constants/report')

Page({
  data: {
    reportId: '',
    successMessage: REPORT_SUCCESS_MESSAGE,
  },

  onLoad(options) {
    if (options.success !== '1') {
      wx.redirectTo({ url: '/pages/home/index' })
      return
    }
    this.setData({
      reportId: options.reportId || '',
    })
  },

  onBackHome() {
    wx.switchTab({ url: '/pages/home/index' })
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 })
      return
    }
    wx.switchTab({ url: '/pages/home/index' })
  },
})
