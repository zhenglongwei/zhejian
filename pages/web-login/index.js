/**
 * 官网扫码登录确认页。
 *
 * 官网（电脑浏览器）点「微信登录」会拿到一张小程序码，用户扫码后落到这里：
 * 确认过协议 → 静默登录（wx.login，不取昵称头像）→ 用户点确认 → 官网轮询拿到会话。
 * 没确认过协议时先在本页完成协议确认，再走登录，不绕过启动确认。
 */
const { isLoggedIn } = require('../../utils/auth')
const { hasAgreedLegalConsent, markLegalConsent } = require('../../utils/legal-consent')
const { wechatLogin } = require('../../services/user')
const { post } = require('../../services/request')

const CONFIRM_URL = '/public/web-auth/wx-code/confirm'

Page({
  data: {
    /** loading：处理中；consent：待确认协议；confirm：待用户确认；done/error */
    status: 'loading',
    message: '',
  },

  onLoad(options) {
    const ticket = decodeURIComponent((options && (options.scene || options.ticket)) || '')
    if (!ticket) {
      this.setData({ status: 'error', message: '二维码不对，请回到网页刷新后重新扫码' })
      return
    }
    this._ticket = ticket

    if (!hasAgreedLegalConsent()) {
      this.setData({ status: 'consent' }, () => this.showConsentPopup())
      return
    }
    this.prepare()
  },

  showConsentPopup() {
    const run = () => {
      if (this._left) return
      const popup = this.selectComponent && this.selectComponent('#privacyAuthorizePopup')
      if (!popup || typeof popup.show !== 'function') return
      popup.show({
        title: '欢迎使用辙见',
        description: '继续使用前，请先阅读并同意下列协议。',
      })
    }
    if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
      wx.nextTick(run)
      return
    }
    setTimeout(run, 30)
  },

  onPopupResult(e) {
    const agreed = Boolean(e && e.detail && e.detail.agreed)
    if (this.data.status !== 'consent' || !agreed) return
    markLegalConsent()
    this.setData({ status: 'loading' })
    this.prepare()
  },

  async prepare() {
    if (!isLoggedIn()) {
      try {
        await wechatLogin()
      } catch (e) {
        if (this._left) return
        this.setData({ status: 'error', message: '登录失败，请回到微信重试' })
        return
      }
    }
    if (this._left) return
    this.setData({ status: 'confirm' })
  },

  async onConfirm() {
    if (this._confirming || !this._ticket) return
    this._confirming = true
    this.setData({ message: '' })
    try {
      await post(CONFIRM_URL, { ticket: this._ticket })
      if (this._left) return
      this.setData({ status: 'done' })
    } catch (e) {
      this._confirming = false
      if (this._left) return
      this.setData({ status: 'error', message: (e && e.message) || '确认失败，请重试' })
    }
  },

  onCancel() {
    wx.navigateBack({
      fail() {
        wx.reLaunch({ url: '/pages/role/index' })
      },
    })
  },

  onUnload() {
    this._left = true
  },
})
