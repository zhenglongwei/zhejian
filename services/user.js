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
  return data
}

async function wechatLogin() {
  let code = ''
  try {
    const res = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('wx.login timeout')), 10000)
      wx.login({
        success(res) {
          clearTimeout(timer)
          resolve(res)
        },
        fail(err) {
          clearTimeout(timer)
          reject(err)
        },
      })
    })
    code = res.code || ''
  } catch (e) {
    // mock / 开发者工具下 wx.login 可能超时，不阻塞 dev 登录
  }

  if (ENV.mode === 'mock') {
    const { token, user } = await mockWechatLogin(code)
    saveSession({ token, user })
    return { token, user }
  }

  const data = await post('/user/auth/wechat-login', { code })
  saveSession({ token: data.token, user: data.user })
  return data
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
    encryptedData: detail.encryptedData,
    iv: detail.iv,
    code: detail.code,
  })
  const { user } = getSession()
  const nextUser = {
    ...user,
    ...data,
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

module.exports = {
  fetchMineSummary,
  wechatLogin,
  bindPhone,
  logout,
}
