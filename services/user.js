/**
 * 用户账户 — D5 mock
 * MOCK: 联调后接 /api/user/auth/* 与 /api/user/mine/summary
 */
const { ENV } = require('./config')
const { get, post } = require('./request')
const {
  getSession,
  saveSession,
  clearSession,
  maskPhone,
} = require('../utils/auth')
const {
  mockWechatLogin,
  mockBindPhone,
  mockMineSummary,
  mockLogout,
  mockUpdateUserProfile,
} = require('../mock/user')

async function fetchMineSummary() {
  const { token, user } = getSession()
  if (!token) return null

  if (ENV.mode === 'mock') {
    return mockMineSummary(user)
  }

  const data = await get('/user/mine/summary')
  if (data && data.user && data.user.phoneDisplay) {
    data.user.phoneDisplay = maskPhone(data.user.phoneDisplay)
  }
  if (data) {
    saveSession({
      user: data.user,
      roles: data.roles || ['user'],
      merchant: data.merchant || null,
    })
  }
  return data
}

async function wechatLogin() {
  let code = ''
  try {
    code = await getWxLoginCode()
  } catch (e) {
    if (ENV.mode === 'prod') {
      throw new Error('微信登录失败，请重试')
    }
  }

  if (ENV.mode === 'mock') {
    const { token, user } = await mockWechatLogin(code)
    saveSession({ token, user })
    return { token, user }
  }

  const data = await post('/user/auth/wechat-login', { code })
  saveSession({
    token: data.token,
    user: data.user,
    roles: data.roles || ['user'],
    merchant: data.merchant || null,
  })
  return data
}

function getWxLoginCode() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('wx.login timeout')), 10000)
    wx.login({
      success(res) {
        clearTimeout(timer)
        resolve(res.code || '')
      },
      fail(err) {
        clearTimeout(timer)
        reject(err)
      },
    })
  })
}

async function bindPhone(detail) {
  if (ENV.mode === 'mock') {
    const patch = await mockBindPhone(detail)
    const { user } = getSession()
    const nextUser = { ...user, ...patch }
    saveSession({ user: nextUser })
    return nextUser
  }

  const data = await post('/user/auth/bind-phone', {
    code: detail.code || '',
    phoneCode: detail.code || '',
    encryptedData: detail.encryptedData,
    iv: detail.iv,
  })
  const { user } = getSession()
  const nextUser = {
    ...user,
    ...data,
    phone: data.phone || user.phone || '',
    phoneDisplay: maskPhone(data.phoneDisplay || data.phone || ''),
    isPhoneBound: true,
  }
  saveSession({ user: nextUser })
  return nextUser
}

async function logout() {
  if (ENV.mode !== 'mock') {
    try {
      await post('/user/auth/logout')
    } catch (e) {
      // 本地仍清除登录态
    }
  } else {
    await mockLogout()
  }
  clearSession()
}

async function updateUserProfile(payload = {}) {
  const { user } = getSession()
  if (!user) {
    throw new Error('请先登录')
  }

  if (ENV.mode === 'mock') {
    const nextUser = await mockUpdateUserProfile(payload, user)
    saveSession({ user: nextUser })
    return nextUser
  }

  const data = await post('/user/profile', payload)
  const nextUser = {
    ...user,
    ...data,
    nickname: data.nickname !== undefined ? data.nickname : user.nickname,
    avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : user.avatarUrl,
  }
  saveSession({ user: nextUser })
  return nextUser
}

async function refreshSession() {
  if (ENV.mode === 'mock') return null
  const data = await post('/merchant/auth/refresh-session')
  saveSession({
    token: data.token,
    user: data.user,
    roles: data.roles || ['user'],
    merchant: data.merchant || null,
  })
  return data
}

module.exports = {
  fetchMineSummary,
  wechatLogin,
  bindPhone,
  updateUserProfile,
  logout,
  refreshSession,
}
