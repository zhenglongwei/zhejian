const { config } = require('../config')

/** @type {{ token: string, expiresAt: number } | null} */
let accessTokenCache = null

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options)
  const data = await res.json()
  return data
}

function assertWechatConfigured() {
  if (!config.wechat.configured) {
    const err = new Error('微信登录未配置，请联系管理员')
    err.status = 503
    throw err
  }
}

/**
 * wx.login code → openid / session_key
 * @param {string} code
 */
async function code2Session(code) {
  assertWechatConfigured()
  if (!code) {
    const err = new Error('缺少微信登录凭证')
    err.status = 400
    throw err
  }

  const params = new URLSearchParams({
    appid: config.wechat.appId,
    secret: config.wechat.appSecret,
    js_code: code,
    grant_type: 'authorization_code',
  })
  const data = await fetchJson(
    `https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`,
  )

  if (data.errcode) {
    const err = new Error(data.errmsg || '微信登录失败')
    err.status = 401
    err.code = data.errcode
    throw err
  }
  if (!data.openid) {
    const err = new Error('微信登录未返回 openid')
    err.status = 502
    throw err
  }
  return {
    openid: data.openid,
    sessionKey: data.session_key || '',
    unionid: data.unionid || '',
  }
}

async function getAccessToken() {
  assertWechatConfigured()
  const now = Date.now()
  if (accessTokenCache && accessTokenCache.expiresAt > now + 60_000) {
    return accessTokenCache.token
  }

  const params = new URLSearchParams({
    grant_type: 'client_credential',
    appid: config.wechat.appId,
    secret: config.wechat.appSecret,
  })
  const data = await fetchJson(
    `https://api.weixin.qq.com/cgi-bin/token?${params.toString()}`,
  )

  if (data.errcode) {
    const err = new Error(data.errmsg || '获取微信 access_token 失败')
    err.status = 502
    throw err
  }

  accessTokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 7200) * 1000,
  }
  return accessTokenCache.token
}

/**
 * getPhoneNumber 返回的 code → 明文手机号
 * @param {string} phoneCode
 */
async function getPhoneNumber(phoneCode) {
  assertWechatConfigured()
  if (!phoneCode) {
    const err = new Error('缺少手机号授权凭证')
    err.status = 400
    throw err
  }

  const accessToken = await getAccessToken()
  const data = await fetchJson(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: phoneCode }),
    },
  )

  if (data.errcode) {
    const err = new Error(data.errmsg || '获取手机号失败')
    err.status = 400
    err.code = data.errcode
    throw err
  }

  const phone = data.phone_info?.purePhoneNumber || data.phone_info?.phoneNumber || ''
  if (!phone) {
    const err = new Error('微信未返回手机号')
    err.status = 502
    throw err
  }
  return phone
}

module.exports = {
  code2Session,
  getAccessToken,
  getPhoneNumber,
}
