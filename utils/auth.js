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
    roles: wx.getStorageSync('roles') || [],
    merchant: wx.getStorageSync('merchant') || null,
  }
}

function isMerchant() {
  const { roles, merchant } = getSession()
  return (
    (Array.isArray(roles) && roles.includes('merchant')) ||
    Boolean(merchant && merchant.merchantId)
  )
}

/** 店铺管理员（创建者），可管理员工 */
function isMerchantOwner() {
  const { merchant } = getSession()
  return Boolean(merchant && merchant.staffRole === 'owner')
}

function isLoggedIn() {
  return Boolean(getSession().token)
}

function isPhoneBound() {
  const { user } = getSession()
  return Boolean(user && user.isPhoneBound)
}

function saveSession({ token, user, roles, merchant }) {
  if (token) wx.setStorageSync(STORAGE_TOKEN, token)
  if (user !== undefined) wx.setStorageSync(STORAGE_USER, user)
  if (roles !== undefined) wx.setStorageSync('roles', roles)
  if (merchant !== undefined) wx.setStorageSync('merchant', merchant)
  syncAppSession()
}

function clearSession() {
  wx.removeStorageSync(STORAGE_TOKEN)
  wx.removeStorageSync(STORAGE_USER)
  wx.removeStorageSync('roles')
  wx.removeStorageSync('merchant')
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
  isMerchant,
  isMerchantOwner,
  saveSession,
  clearSession,
  syncAppSession,
  checkAuth,
}
