const STORAGE_TOKEN = 'token'
const STORAGE_USER = 'userInfo'

/**
 * 手机号脱敏：138****5678
 * @param {string} phone
 */
function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return phone
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}****${digits.slice(7)}`
  }
  return `${digits.slice(0, 2)}****${digits.slice(-1)}`
}

function getSession() {
  return {
    token: wx.getStorageSync(STORAGE_TOKEN) || '',
    user: wx.getStorageSync(STORAGE_USER) || null,
  }
}

function isLoggedIn() {
  return Boolean(getSession().token)
}

function isPhoneBound() {
  const { user } = getSession()
  return Boolean(user && user.isPhoneBound)
}

function saveSession({ token, user }) {
  if (token) wx.setStorageSync(STORAGE_TOKEN, token)
  if (user !== undefined) wx.setStorageSync(STORAGE_USER, user)
  syncAppSession()
}

function clearSession() {
  wx.removeStorageSync(STORAGE_TOKEN)
  wx.removeStorageSync(STORAGE_USER)
  syncAppSession()
}

function syncAppSession() {
  const session = getSession()
  try {
    const app = getApp()
    if (app && app.globalData) {
      app.globalData.token = session.token
      app.globalData.userInfo = session.user
    }
  } catch (e) {
    // getApp may fail during app init
  }
  return session
}

/**
 * 检查登录/绑手机前置条件
 * @param {{ needPhone?: boolean }} opts
 * @returns {{ ok: true, session: object } | { ok: false, reason: 'login'|'bindPhone' }}
 */
function checkAuth(opts = {}) {
  const session = getSession()
  if (!session.token) {
    return { ok: false, reason: 'login' }
  }
  if (opts.needPhone && !(session.user && session.user.isPhoneBound)) {
    return { ok: false, reason: 'bindPhone' }
  }
  return { ok: true, session }
}

module.exports = {
  maskPhone,
  getSession,
  isLoggedIn,
  isPhoneBound,
  saveSession,
  clearSession,
  syncAppSession,
  checkAuth,
}
