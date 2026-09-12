/**
 * 短信发送（阿里云 Dysmsapi RPC）。
 * 凭证与 OSS / 脱敏相同：优先环境变量 AccessKey，否则用 ECS 实例角色临时凭证。
 */
const crypto = require('crypto')
const { config } = require('../config')
const { getCredential } = require('./aliyun-clients')

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

function hasStaticAccessKey() {
  return Boolean(config.sms.accessKeyId && config.sms.accessKeySecret)
}

/** 生产 ECS 或显式角色名：可向实例要临时凭证，不必写 AccessKey */
function canUseEcsRamRoleForSms() {
  if (process.env.ECS_RAM_ROLE_NAME || process.env.ALIBABA_CLOUD_ECS_METADATA_ROLE_NAME) return true
  return String(config.nodeEnv || '') === 'production' && config.devAuthEnabled === false
}

function isSmsSendReady() {
  const sign = String(config.sms.signName || '').trim()
  const tpl = String(config.sms.templateVerifyCode || '').trim()
  if (!sign || !tpl) return false
  return hasStaticAccessKey() || canUseEcsRamRoleForSms()
}

function withTimeout(promise, ms, label) {
  const timeoutMs = Number(ms) || 8000
  let timer
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label || '短信凭证'}超时（${timeoutMs}ms）`)
      err.code = 'SMS_CREDENTIAL_TIMEOUT'
      reject(err)
    }, timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer))
}

async function resolveSmsCreds() {
  const cred = getCredential()
  const raw = await withTimeout(cred.getCredential(), 8000, '获取短信凭证')
  const accessKeyId = (raw && raw.accessKeyId) || ''
  const accessKeySecret = (raw && raw.accessKeySecret) || ''
  const securityToken = (raw && (raw.securityToken || raw.security_token)) || ''
  if (!accessKeyId || !accessKeySecret) {
    const err = new Error('阿里云凭证不可用，无法发短信')
    err.code = 'SMS_CREDENTIAL_MISSING'
    throw err
  }
  return { accessKeyId, accessKeySecret, securityToken }
}

function buildSendSmsParams({ mobile, tpl, sign, templateParam, creds, nonce, timestamp }) {
  const params = {
    AccessKeyId: creds.accessKeyId,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: mobile,
    RegionId: config.sms.regionId || 'cn-hangzhou',
    SignName: sign,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: nonce || crypto.randomBytes(12).toString('hex'),
    SignatureVersion: '1.0',
    TemplateCode: tpl,
    TemplateParam: JSON.stringify(templateParam || {}),
    Timestamp: timestamp || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25',
  }
  if (creds.securityToken) params.SecurityToken = creds.securityToken
  params.Signature = signAliyunRpc(params, creds.accessKeySecret)
  return params
}

async function requestAliyunSms(query) {
  const url = `https://dysmsapi.aliyuncs.com/?${query}`
  const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) })
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
  if (!tpl || !sign || !isSmsSendReady()) {
    if (config.sms.required) {
      return { ok: false, reason: 'sms_not_configured' }
    }
    console.warn('[sms] skipped (not configured)', mobile.slice(0, 3) + '****')
    return { ok: true, skipped: true, provider: 'log' }
  }

  let creds
  try {
    creds = await resolveSmsCreds()
  } catch (err) {
    return {
      ok: false,
      reason: (err && err.code) || 'sms_credential_failed',
      message: (err && err.message) || '',
    }
  }

  const params = buildSendSmsParams({ mobile, tpl, sign, templateParam, creds })
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
      message: String(data.Message || ''),
      provider: 'aliyun',
    }
  } catch (err) {
    return { ok: false, reason: (err && err.message) || 'sms_request_failed', message: '' }
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
  isSmsSendReady,
  sendSms,
  sendCaseNotifySms,
  signAliyunRpc,
  buildSendSmsParams,
}
