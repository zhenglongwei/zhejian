const { ENV } = require('./services/config')
const { syncAppSession } = require('./utils/auth')
const { recordAppLaunchEntry } = require('./utils/tool-entry-context')

const PRIVACY_FALLBACK_PAGE = '/pages/privacy-authorize/index'
/** 启动确认里用户同意后，短时间内到达的授权请求视为已同意 */
const CONSENT_APPROVE_TTL = 5000

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
      // 用户刚在启动确认里同意过（点击早于本次回调），直接放行
      if (this.isConsentApproved()) {
        resolve({ buttonId: 'privacy-agree-btn', event: 'agree' })
        return
      }
      this.globalData.pendingPrivacyAuthorization = { resolve }
      if (this.privacyPopup && typeof this.privacyPopup.show === 'function') {
        this.privacyPopup.show()
        return
      }
      // 当前页面没挂弹窗（深链直达页常见）：跳承接页，避免点了没反应
      this.openPrivacyFallbackPage()
    })
  },

  markConsentApproved() {
    this._consentApprovedAt = Date.now()
  },

  isConsentApproved() {
    if (!this._consentApprovedAt) return false
    return Date.now() - this._consentApprovedAt < CONSENT_APPROVE_TTL
  },

  openPrivacyFallbackPage() {
    if (this._privacyPageOpening) return
    this._privacyPageOpening = true
    wx.navigateTo({
      url: PRIVACY_FALLBACK_PAGE,
      fail: () => {
        this._privacyPageOpening = false
        // 兜底页也打不开时交给微信原生弹窗，再不行就按拒绝处理
        if (typeof wx.requirePrivacyAuthorize === 'function') {
          wx.requirePrivacyAuthorize({})
          return
        }
        this.completePrivacyAuthorization(false)
      },
    })
  },

  completePrivacyAuthorization(agreed) {
    const pending = this.globalData.pendingPrivacyAuthorization
    this._privacyPageOpening = false
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
