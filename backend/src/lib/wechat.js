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

/**
 * 小程序码（无数量限制），scene 最长 32 字符
 * @param {{ page: string, scene: string, width?: number, envVersion?: string }} options
 * @returns {Promise<Buffer>}
 */
async function getWxaCodeUnlimited(options = {}) {
  assertWechatConfigured()
  const { page, scene, width = 280, envVersion = 'release' } = options
  if (!page || !scene) {
    const err = new Error('缺少小程序码 page 或 scene')
    err.status = 400
    throw err
  }
  if (String(scene).length > 32) {
    const err = new Error('scene 超过 32 字符限制')
    err.status = 400
    throw err
  }

  const accessToken = await getAccessToken()
  const res = await fetch(
    `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page,
        scene,
        width,
        check_path: false,
        env_version: envVersion,
      }),
    },
  )

  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const data = await res.json()
    const err = new Error(data.errmsg || '生成小程序码失败')
    err.status = 502
    err.code = data.errcode
    throw err
  }

  return Buffer.from(await res.arrayBuffer())
}

/**
 * 发送订阅消息（用户须已在小程序端 requestSubscribeMessage 授权）
 * @param {{ openid: string, templateId: string, page?: string, data: object, miniprogramState?: string }} options
 */
async function sendSubscribeMessage(options = {}) {
  assertWechatConfigured()
  const { openid, templateId, page = '', data = {}, miniprogramState = 'formal' } = options
  if (!openid || !templateId) {
    const err = new Error('缺少 openid 或 templateId')
    err.status = 400
    throw err
  }

  const accessToken = await getAccessToken()
  const body = {
    touser: openid,
    template_id: templateId,
    page,
    miniprogram_state: miniprogramState,
    lang: 'zh_CN',
    data,
  }
  const result = await fetchJson(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )

  if (result.errcode) {
    const err = new Error(result.errmsg || '订阅消息发送失败')
    err.status = 502
    err.code = result.errcode
    throw err
  }
  return result
}

module.exports = {
  code2Session,
  getAccessToken,
  getPhoneNumber,
  getWxaCodeUnlimited,
  sendSubscribeMessage,
}
