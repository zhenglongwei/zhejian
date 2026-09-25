/**
 * 短信验证码 — 官网登录与小程序换绑手机号共用
 *
 * 三条纪律（沿用原 web-auth 口径）：
 *   1. 验证码只存内存，5 分钟过期、验证一次即作废，不落库、不进日志；
 *   2. 防刷：同一手机号 60 秒一条、每天 10 条；同一 IP 每天 20 条；
 *   3. 签名、模板配齐且能拿到阿里云凭证就真发；本地没工牌时用 888888。
 */

const { config } = require('../config')
const { isChinaMobilePhone, isSmsSendReady, sendSms } = require('../lib/sms')
const { consumeDailyLimit } = require('./geo-check-rate-limit')

const CODE_TTL_MS = 5 * 60 * 1000
const RESEND_INTERVAL_MS = 60 * 1000
const PER_PHONE_PER_DAY = 10
const PER_IP_PER_DAY = 20

/** phone → { code, expiresAt, sentAt }。只存内存。 */
const codeStore = new Map()

function randomCode() {
  // 6 位数字，首位不为 0——用户手输体验优先，安全性靠 5 分钟过期 + 防刷
  return String(100000 + Math.floor(Math.random() * 900000))
}

function allowLoginDebugCode() {
  if (String(config.sms.debugCode || '').trim()) return true
  if (isSmsSendReady()) return false
  if (config.devAuthEnabled) return true
  if (!config.sms.required) return true
  return false
}

function resolveLoginDebugCode() {
  const explicit = String(config.sms.debugCode || '').trim()
  if (explicit) return explicit
  if (isSmsSendReady()) return ''
  if (allowLoginDebugCode()) return '888888'
  return ''
}

function smsFailureMessage(sent) {
  const blob = `${(sent && sent.reason) || ''} ${(sent && sent.message) || ''}`
  if (/未开通|NOT.?OPEN|FORBIDDEN|OUT_OF_SERVICE|sms_not_configured/i.test(blob)) {
    return '短信业务未开通。本地测试请用验证码 888888；正式发短信需在阿里云开通短信并配置验证码模板。'
  }
  return '短信没发出去，稍后再试'
}

/**
 * 发验证码。防刷两层：手机号维度（60s 间隔 + 每日上限）、IP 维度（每日上限）。
 * @returns {Promise<{ok:true, resendAfterSec:number, loginHint?:string} | {ok:false, code:string, message:string}>}
 */
async function sendLoginCode(phone, ip = '') {
  const mobile = String(phone || '').trim()
  if (!isChinaMobilePhone(mobile)) {
    return { ok: false, code: 'INVALID_PHONE', message: '手机号格式不对' }
  }
  const debugCode = resolveLoginDebugCode()
  if (!isSmsSendReady() && !debugCode) {
    return {
      ok: false,
      code: 'SMS_NOT_CONFIGURED',
      message: '短信发不出去。请给云服务器实例角色加上短信权限，或本地设置 SMS_DEBUG_CODE=888888',
    }
  }

  const existing = codeStore.get(mobile)
  if (existing && Date.now() - existing.sentAt < RESEND_INTERVAL_MS) {
    const waitSec = Math.ceil((RESEND_INTERVAL_MS - (Date.now() - existing.sentAt)) / 1000)
    return { ok: false, code: 'TOO_FREQUENT', message: `发送太频繁，${waitSec} 秒后再试` }
  }

  const ipQuota = consumeDailyLimit(`sms-ip:${ip}`, PER_IP_PER_DAY, 'sms-ip')
  if (!ipQuota.allowed) {
    return { ok: false, code: 'IP_LIMIT', message: '今天的验证码次数用完了，明天再来' }
  }
  const phoneQuota = consumeDailyLimit(`sms-phone:${mobile}`, PER_PHONE_PER_DAY, 'sms-phone')
  if (!phoneQuota.allowed) {
    return { ok: false, code: 'PHONE_LIMIT', message: '这个手机号今天收的验证码够多了，明天再试' }
  }

  let code = debugCode || randomCode()
  let usedDebug = Boolean(debugCode)
  if (!usedDebug) {
    const sent = await sendSms({
      phone: mobile,
      templateCode: config.sms.templateVerifyCode,
      signName: config.sms.signName,
      templateParam: { code },
    })
    if (!sent.ok) {
      console.error('[sms-code] 验证码短信发送失败：', sent.reason, sent.message || '')
      const fallback =
        String(config.sms.debugCode || '').trim() || (allowLoginDebugCode() ? '888888' : '')
      if (fallback) {
        code = fallback
        usedDebug = true
      } else {
        return { ok: false, code: 'SMS_FAILED', message: smsFailureMessage(sent) }
      }
    }
  }

  codeStore.set(mobile, { code, expiresAt: Date.now() + CODE_TTL_MS, sentAt: Date.now() })
  if (codeStore.size > 2000) {
    const now = Date.now()
    for (const [k, v] of codeStore) {
      if (v.expiresAt < now) codeStore.delete(k)
    }
  }

  const payload = { ok: true, resendAfterSec: Math.ceil(RESEND_INTERVAL_MS / 1000) }
  if (usedDebug) {
    payload.loginHint = `当前未发短信，验证码 ${code}`
  }
  return payload
}

/**
 * 只校验验证码（一次作废），不登录、不改数据。
 * @returns {{ok:true} | {ok:false, code:string, message:string}}
 */
function verifyLoginCode(phone, code) {
  const mobile = String(phone || '').trim()
  const input = String(code || '').trim()
  if (!isChinaMobilePhone(mobile)) {
    return { ok: false, code: 'INVALID_PHONE', message: '手机号格式不对' }
  }

  const record = codeStore.get(mobile)
  if (!record || Date.now() > record.expiresAt) {
    codeStore.delete(mobile)
    return { ok: false, code: 'CODE_EXPIRED', message: '验证码已过期，重新获取一个' }
  }
  if (record.code !== input) {
    return { ok: false, code: 'CODE_WRONG', message: '验证码不对' }
  }
  codeStore.delete(mobile)
  return { ok: true }
}

module.exports = {
  sendLoginCode,
  verifyLoginCode,
  resolveLoginDebugCode,
  // 仅供冒烟测试检视内部状态
  _codeStore: codeStore,
}
