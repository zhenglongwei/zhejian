/**
 * 隐私授权兜底页。
 * 深链直达页（案例、门店、相册等）没有挂载隐私弹窗时，由 app.js 跳到这里承接，
 * 用户表态后返回原页面，避免「点了登录没反应」。
 */
Page({
  data: {},

  onLoad() {
    const app = getApp()
    const pending = app && app.globalData && app.globalData.pendingPrivacyAuthorization
    if (!pending) {
      this.goBack()
    }
  },

  onUnload() {
    // 用户用返回键/手势离开时也要表态，避免授权悬挂导致原流程卡住
    const app = getApp()
    if (app && typeof app.completePrivacyAuthorization === 'function') {
      app.completePrivacyAuthorization(false)
    }
    if (app) app._privacyPageOpening = false
  },

  onResult() {
    this.goBack()
  },

  goBack() {
    if (this._backing) return
    this._backing = true
    wx.navigateBack({
      fail() {
        wx.reLaunch({ url: '/pages/role/index' })
      },
    })
  },
})
