const { ENV } = require('./services/config')
const { syncAppSession } = require('./utils/auth')
const { recordAppLaunchEntry } = require('./utils/tool-entry-context')

App({
  onLaunch(options) {
    console.info('[app] launch', ENV.mode)
    try {
      syncAppSession()
      this.globalData.toolEntryContext = recordAppLaunchEntry(options || {})
      this.bindPrivacyAuthorization()
    } catch (err) {
      console.warn('[app] onLaunch init failed', err)
    }
  },

  bindPrivacyAuthorization() {
    if (typeof wx.onNeedPrivacyAuthorization !== 'function') return
    wx.onNeedPrivacyAuthorization((resolve) => {
      this.globalData.pendingPrivacyAuthorization = { resolve }
      if (this.privacyPopup && typeof this.privacyPopup.show === 'function') {
        this.privacyPopup.show()
        return
      }
      // 等待页面内弹窗挂载，勿立即拒绝
    })
  },

  completePrivacyAuthorization(agreed) {
    const pending = this.globalData.pendingPrivacyAuthorization
    if (!pending || typeof pending.resolve !== 'function') return
    if (agreed) {
      pending.resolve({ buttonId: 'privacy-agree-btn', event: 'agree' })
    } else {
      pending.resolve({ event: 'disagree' })
    }
    this.globalData.pendingPrivacyAuthorization = null
  },
  globalData: {
    city: '杭州',
    pendingPrivacyAuthorization: null,
    userInfo: null,
    token: '',
    pendingServiceCategory: '',
    /** 我的页跳转订单 Tab 时携带的筛选 key */
    pendingOrderTab: '',
    /** 工具首页 · 冷启动入口（公域搜索 / 商家扫码） */
    toolEntryContext: null,
    /** 分享链路单店隔离上下文 */
    shareStoreContext: null,
  },
})
