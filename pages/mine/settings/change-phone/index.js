const { sendPhoneChangeCode, changePhone } = require('../../../../services/user')
const { isLoggedIn } = require('../../../../utils/auth')

const PHONE_RE = /^1\d{10}$/
const COUNTDOWN_SEC = 60

Page({
  data: {
    status: 'normal',
    phone: '',
    code: '',
    countdown: 0,
    sending: false,
    submitting: false,
    errorMessage: '',
    canSend: false,
    canSubmit: false,
    codeBtnText: '获取验证码',
  },

  onShow() {
    this.setData({ status: isLoggedIn() ? 'normal' : 'unauthenticated' })
  },

  onUnload() {
    this.clearTimer()
  },

  onPhoneInput(e) {
    const phone = String((e.detail && e.detail.value) || '').trim()
    this.setData({ phone, errorMessage: '' }, () => this.refreshButtons())
  },

  onCodeInput(e) {
    const code = String((e.detail && e.detail.value) || '').trim()
    this.setData({ code, errorMessage: '' }, () => this.refreshButtons())
  },

  refreshButtons() {
    const phoneOk = PHONE_RE.test(this.data.phone)
    this.setData({
      canSend: phoneOk && this.data.countdown === 0 && !this.data.sending,
      canSubmit: phoneOk && this.data.code.length === 6 && !this.data.submitting,
      codeBtnText: this.data.countdown > 0 ? `${this.data.countdown} 秒后重发` : '获取验证码',
    })
  },

  async onSendCode() {
    if (!this.data.canSend || this.data.sending) return
    this.setData({ sending: true, errorMessage: '' })
    try {
      const result = await sendPhoneChangeCode(this.data.phone)
      wx.showToast({
        title: (result && result.loginHint) || '验证码已发送',
        icon: 'none',
      })
      this.startCountdown()
    } catch (err) {
      this.setData({ errorMessage: (err && err.message) || '验证码发送失败，请稍后重试' })
    } finally {
      this.setData({ sending: false }, () => this.refreshButtons())
    }
  },

  startCountdown() {
    this.clearTimer()
    this.setData({ countdown: COUNTDOWN_SEC }, () => this.refreshButtons())
    this._timer = setInterval(() => {
      const next = this.data.countdown - 1
      if (next <= 0) {
        this.clearTimer()
        this.setData({ countdown: 0 }, () => this.refreshButtons())
        return
      }
      this.setData({ countdown: next }, () => this.refreshButtons())
    }, 1000)
  },

  clearTimer() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  async onSubmit() {
    if (!this.data.canSubmit || this.data.submitting) return
    this.setData({ submitting: true, errorMessage: '' })
    wx.showLoading({ title: '提交中', mask: true })
    try {
      await changePhone({ phone: this.data.phone, code: this.data.code })
      wx.hideLoading()
      wx.showToast({ title: '手机号已更换', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (err) {
      wx.hideLoading()
      this.setData({
        submitting: false,
        errorMessage: (err && err.message) || '更换失败，请稍后重试',
      })
      this.refreshButtons()
    }
  },

  onLoginTap() {
    wx.navigateBack()
  },
})
