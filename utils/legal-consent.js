/**
 * 启动期协议确认 — 记在这台手机上，随协议版本升级重新确认一次。
 * 只回答「本机有没有确认过当前版本的协议」，不参与身份判定。
 * @see docs/02_用户端小程序/02_工具入口首页.md §4.1
 */

const { LEGAL_VERSION } = require('../constants/legal-meta')

const STORAGE_KEY = 'zj_legal_consent_v1'

function hasAgreedLegalConsent() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    if (!raw) return false
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Boolean(saved && saved.version === LEGAL_VERSION)
  } catch (e) {
    return false
  }
}

function markLegalConsent() {
  try {
    wx.setStorageSync(STORAGE_KEY, {
      version: LEGAL_VERSION,
      agreedAt: Date.now(),
    })
  } catch (e) {
    // 写入失败不影响本次进入，下次启动会再确认一次
  }
}

module.exports = {
  hasAgreedLegalConsent,
  markLegalConsent,
}
