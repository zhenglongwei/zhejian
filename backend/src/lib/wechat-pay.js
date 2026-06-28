const crypto = require('crypto')
const { config } = require('../config')

function assertWechatPayConfigured() {
  if (!config.wechatPay.configured) {
    const err = new Error('微信支付未配置，请联系管理员')
    err.status = 503
    throw err
  }
}

function signMessage(message) {
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(message)
  sign.end()
  return sign.sign(config.wechatPay.privateKey, 'base64')
}

function buildAuthorization(method, urlPath, body) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = crypto.randomBytes(16).toString('hex')
  const bodyStr = body ? JSON.stringify(body) : ''
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${bodyStr}\n`
  const signature = signMessage(message)
  const authorization = [
    'WECHATPAY2-SHA256-RSA2048',
    `mchid="${config.wechatPay.mchId}"`,
    `nonce_str="${nonce}"`,
    `signature="${signature}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${config.wechatPay.certSerial}"`,
  ].join(',')
  return { authorization, timestamp, nonce }
}

async function wechatPayRequest(method, urlPath, body) {
  assertWechatPayConfigured()
  const { authorization } = buildAuthorization(method, urlPath, body)
  const res = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authorization,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.message || data.code || '微信支付请求失败')
    err.status = 502
    err.details = data
    throw err
  }
  return data
}

/**
 * JSAPI 下单
 * @param {{ outTradeNo: string, description: string, amount: number, openid: string }} params
 */
async function createJsapiOrder(params) {
  const path = '/v3/pay/transactions/jsapi'
  const data = await wechatPayRequest('POST', path, {
    appid: config.wechat.appId,
    mchid: config.wechatPay.mchId,
    description: params.description,
    out_trade_no: params.outTradeNo,
    notify_url: config.wechatPay.notifyUrl,
    amount: { total: params.amount, currency: 'CNY' },
    payer: { openid: params.openid },
  })
  return data.prepay_id
}

function buildMiniProgramPayParams(prepayId) {
  assertWechatPayConfigured()
  const packageStr = `prepay_id=${prepayId}`
  const timeStamp = Math.floor(Date.now() / 1000).toString()
  const nonceStr = crypto.randomBytes(16).toString('hex')
  const message = `${config.wechat.appId}\n${timeStamp}\n${nonceStr}\n${packageStr}\n`
  const paySign = signMessage(message)
  return {
    timeStamp,
    nonceStr,
    package: packageStr,
    signType: 'RSA',
    paySign,
  }
}

function decryptNotifyResource(resource) {
  assertWechatPayConfigured()
  const { ciphertext, associated_data: associatedData, nonce } = resource || {}
  if (!ciphertext || !nonce) {
    const err = new Error('回调资源无效')
    err.status = 400
    throw err
  }
  const key = Buffer.from(config.wechatPay.apiV3Key, 'utf8')
  const buf = Buffer.from(ciphertext, 'base64')
  const authTag = buf.subarray(buf.length - 16)
  const data = buf.subarray(0, buf.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'))
  decipher.setAuthTag(authTag)
  if (associatedData) {
    decipher.setAAD(Buffer.from(associatedData, 'utf8'))
  }
  const decoded = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(decoded.toString('utf8'))
}

module.exports = {
  assertWechatPayConfigured,
  createJsapiOrder,
  buildMiniProgramPayParams,
  decryptNotifyResource,
}
