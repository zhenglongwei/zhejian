const { REPORT_SUCCESS_MESSAGE } = require('../../../utils/report-form')
const { reLaunchAppHome } = require('../../../utils/app-home')

Page({
  data: {
    reportId: '',
    successMessage: REPORT_SUCCESS_MESSAGE,
  },

  onLoad(options) {
    if (options.success !== '1') {
      reLaunchAppHome()
      return
    }
    this.setData({
      reportId: options.reportId || '',
    })
  },

  onBackHome() {
    reLaunchAppHome()
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 })
      return
    }
    reLaunchAppHome()
  },
})
