/**
 * 短信发送（阿里云 Dysmsapi RPC）。未配置时按环境跳过或失败。
 * 生产默认必须发出，否则不得进入公开异议窗口。
 */
const crypto = require('crypto')
const { config } = require('../config')

function isChinaMobilePhone(phone) {
  return /^1[3-9]\d{9}$/.test(String(phone || '').trim())
}

function percentEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%7E/g, '~')
}

function signAliyunRpc(params, accessKeySecret) {
  const keys = Object.keys(params).sort()
  const canonical = keys.map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&')
  const stringToSign = `GET&${percentEncode('/')}&${percentEncode(canonical)}`
  return crypto
    .createHmac('sha1', `${accessKeySecret}&`)
    .update(stringToSign)
    .digest('base64')
}

async function requestAliyunSms(query) {
  const url = `https://dysmsapi.aliyuncs.com/?${query}`
  const res = await fetch(url, { method: 'GET' })
  const text = await res.text()
  let data = {}
  try {
    data = JSON.parse(text)
  } catch (_) {
    data = { Code: 'ParseError', Message: text.slice(0, 200) }
  }
  return data
}

/**
 * @returns {Promise<{ ok: boolean, skipped?: boolean, provider?: string, messageId?: string, reason?: string }>}
 */
async function sendSms({ phone, templateCode, templateParam = {}, signName } = {}) {
  const mobile = String(phone || '').trim()
  if (!isChinaMobilePhone(mobile)) {
    return { ok: false, reason: 'invalid_phone' }
  }

  const tpl = String(templateCode || '').trim()
  const sign = String(signName || config.sms.signName || '').trim()
  const accessKeyId = config.sms.accessKeyId
  const accessKeySecret = config.sms.accessKeySecret
  const configured = Boolean(accessKeyId && accessKeySecret && tpl && sign)

  if (!configured) {
    if (config.sms.required) {
      return { ok: false, reason: 'sms_not_configured' }
    }
    console.warn('[sms] skipped (not configured)', mobile.slice(0, 3) + '****')
    return { ok: true, skipped: true, provider: 'log' }
  }

  const params = {
    AccessKeyId: accessKeyId,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: mobile,
    RegionId: config.sms.regionId || 'cn-hangzhou',
    SignName: sign,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomBytes(12).toString('hex'),
    SignatureVersion: '1.0',
    TemplateCode: tpl,
    TemplateParam: JSON.stringify(templateParam || {}),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25',
  }
  params.Signature = signAliyunRpc(params, accessKeySecret)
  const query = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&')

  try {
    const data = await requestAliyunSms(query)
    if (String(data.Code || '').toUpperCase() === 'OK') {
      return { ok: true, provider: 'aliyun', messageId: data.BizId || '' }
    }
    return {
      ok: false,
      reason: String(data.Code || 'sms_failed'),
      provider: 'aliyun',
    }
  } catch (err) {
    return { ok: false, reason: (err && err.message) || 'sms_request_failed' }
  }
}

/** 正文规格见 COMPLIANCE_COPY.notifyWindowSms；阿里云控制台模板须与之一致。 */
async function sendCaseNotifySms({ phone, storeName, serviceName, hours, link } = {}) {
  return sendSms({
    phone,
    templateCode: config.sms.templateNotify,
    signName: config.sms.signName,
    templateParam: {
      store: String(storeName || '门店').slice(0, 20),
      service: String(serviceName || '维修').slice(0, 20),
      hours: String(hours || config.sms.windowHours || 48),
      link: String(link || '').slice(0, 40),
    },
  })
}

module.exports = {
  isChinaMobilePhone,
  sendSms,
  sendCaseNotifySms,
}
