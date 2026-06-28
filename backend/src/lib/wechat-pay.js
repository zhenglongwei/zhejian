const crypto = require('crypto')
const { config } = require('../config')

function assertWechatPayConfigured() {
  if (!config.wechatPay.configured) {
    const err = new Error('微信支付未配置，请联系管理员')
    err.status = 503
    throw err
  }
}

function normalizeCertSerial(serial) {
  return String(serial || '')
    .replace(/^serial=/i, '')
    .replace(/:/g, '')
    .trim()
    .toUpperCase()
}

function normalizePrivateKeyPem(raw) {
  let pem = String(raw || '').trim()
  if (!pem) return ''
  if (pem.includes('\\n')) {
    pem = pem.replace(/\\n/g, '\n')
  }
  if (!pem.endsWith('\n')) {
    pem += '\n'
  }
  return pem
}

function getSigningPrivateKey() {
  const pem = normalizePrivateKeyPem(config.wechatPay.privateKey)
  if (!pem.includes('PRIVATE KEY')) {
    const err = new Error('WECHAT_PAY_PRIVATE_KEY 格式无效，需 PEM（apiclient_key.pem）')
    err.status = 503
    throw err
  }
  try {
    return crypto.createPrivateKey({ key: pem, format: 'pem' })
  } catch (e) {
    const err = new Error(
      `微信支付私钥无法解析：${e.message}。请确认使用商户平台下载的 apiclient_key.pem`
    )
    err.status = 503
    throw err
  }
}

function signMessage(message) {
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(message, 'utf8')
  sign.end()
  return sign.sign(getSigningPrivateKey(), 'base64')
}

function buildAuthorization(method, urlPath, body) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = crypto.randomBytes(16).toString('hex')
  const bodyStr = body ? JSON.stringify(body) : ''
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${bodyStr}\n`
  const signature = signMessage(message)
  const serialNo = normalizeCertSerial(config.wechatPay.certSerial)
  // 格式：认证类型 + 空格 + 签名参数（逗号分隔，无空格）
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${config.wechatPay.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`
  return { authorization, timestamp, nonce, serialNo }
}

async function wechatPayRequest(method, urlPath, body) {
  assertWechatPayConfigured()
  const { authorization } = buildAuthorization(method, urlPath, body)
  const bodyStr = body ? JSON.stringify(body) : undefined
  const res = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Node fetch 可能带系统 Accept-Language，微信 V3 不接受 → PARAM_ERROR
      'Accept-Language': 'zh-CN',
      Authorization: authorization,
    },
    body: bodyStr,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    let message = data.message || data.code || '微信支付请求失败'
    if (data.code === 'SIGN_ERROR') {
      message =
        '微信支付验签失败：请核对商户私钥(apiclient_key.pem)、证书序列号与商户号是否同一套证书。服务器可执行 node scripts/wechat-pay-smoke.js 诊断'
    }
    const err = new Error(message)
    err.status = 502
    err.code = data.code
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

/**
 * 申请退款（国内）
 * @param {{ transactionId: string, outRefundNo: string, refundAmount: number, totalAmount: number, reason?: string }} params
 */
async function createRefund(params) {
  const path = '/v3/refund/domestic/refunds'
  return wechatPayRequest('POST', path, {
    transaction_id: params.transactionId,
    out_refund_no: params.outRefundNo,
    reason: params.reason || '套餐调整退差额',
    amount: {
      refund: params.refundAmount,
      total: params.totalAmount,
      currency: 'CNY',
    },
  })
}

/** 诊断：拉取平台证书，验证商户私钥 + 证书序列号是否配对 */
async function probeWechatPayAuth() {
  assertWechatPayConfigured()
  const key = getSigningPrivateKey()
  const serial = normalizeCertSerial(config.wechatPay.certSerial)
  const data = await wechatPayRequest('GET', '/v3/certificates', null)
  return {
    ok: true,
    mchId: config.wechatPay.mchId,
    appId: config.wechat.appId,
    certSerial: serial,
    privateKeyType: key.asymmetricKeyType,
    platformCertCount: Array.isArray(data.data) ? data.data.length : 0,
    notifyUrl: config.wechatPay.notifyUrl,
  }
}

module.exports = {
  assertWechatPayConfigured,
  createJsapiOrder,
  buildMiniProgramPayParams,
  decryptNotifyResource,
  createRefund,
  probeWechatPayAuth,
  normalizeCertSerial,
  getSigningPrivateKey,
}
