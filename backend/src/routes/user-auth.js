const express = require('express')
const { ok, fail } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const {
  wechatLogin,
  bindPhone,
  changePhone,
  fetchMineSummary,
  updateUserProfile,
} = require('../services/auth.service')
const { sendLoginCode } = require('../services/sms-code.service')
const { clientIp } = require('../services/geo-check-rate-limit')

const router = express.Router()

router.post('/auth/wechat-login', async (req, res, next) => {
  try {
    const data = await wechatLogin(req.body?.code)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/auth/bind-phone', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await bindPhone(req.auth.userId, req.body || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

/** 更换手机号 · 给新手机号发验证码（已登录即可，不验证旧号） */
router.post('/auth/change-phone/send-code', requireAuth(['user']), async (req, res, next) => {
  try {
    const result = await sendLoginCode(req.body?.phone, clientIp(req))
    if (!result.ok) {
      if (
        result.code === 'TOO_FREQUENT' ||
        result.code === 'IP_LIMIT' ||
        result.code === 'PHONE_LIMIT'
      ) {
        return fail(res, 42911, result.message, 429)
      }
      const status = result.code === 'SMS_NOT_CONFIGURED' ? 503 : 400
      return fail(res, 40011, result.message, status)
    }
    return ok(res, {
      resendAfterSec: result.resendAfterSec,
      loginHint: result.loginHint || '',
    })
  } catch (e) {
    return next(e)
  }
})

/** 更换手机号 · 校验新号验证码后生效；账号主键不变，数据自动跟随 */
router.post('/auth/change-phone', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await changePhone(req.auth.userId, req.body || {})
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

router.post('/auth/logout', requireAuth(['user']), async (req, res, next) => {
  try {
    return ok(res, { ok: true })
  } catch (e) {
    next(e)
  }
})

router.post('/profile', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await updateUserProfile(req.auth.userId, req.body || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/mine/summary', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await fetchMineSummary(req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
