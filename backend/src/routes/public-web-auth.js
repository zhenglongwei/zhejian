/**
 * 官网公开登录（挂 /api/v1/public/web-auth）
 *
 * 手机号 + 短信验证码：登录即注册（2026-09-02 老板定）。
 * 复用辙见账号体系——手机号对上已有 user 即同一账号（商家身份自动带上），
 * 没有则新建 phone-only 账号。签发的 JWT 与小程序同一个（双角色）。
 *
 * 2026-09-25 收口：账号主键是 userId，手机号只是联系方式。已绑微信的账号不再放
 * 行手机号登录（号码被回收后新号主人会直接登进去），改走小程序码登录（/wx-code
 * 系列）；没绑微信的 phone-only 账号仍可用手机号登，登录后引导绑定微信；换号丢下的
 * 旧账号走 /recover-old-account 验证旧号后迁移资产。
 *
 * 该路由的存在意义：让「微信案例转换工具」的配额能按用户等级算
 * （游客 1 次/天、登录 3 次/天），详见 public-wechat-archive.js。
 */

const express = require('express')
const { ok, fail } = require('../lib/response')
const { clientIp } = require('../services/geo-check-rate-limit')
const { requireAuth } = require('../middleware/auth')
const {
  sendLoginCode,
  loginWithCode,
  recoverOldAccount,
} = require('../services/web-auth.service')
const {
  createTicket,
  confirmTicket,
  consumeTicket,
} = require('../services/web-login-ticket.service')

const router = express.Router()

/** 发验证码 */
router.post('/web-auth/send-code', async (req, res, next) => {
  try {
    const result = await sendLoginCode(req.body?.phone, clientIp(req))
    if (!result.ok) {
      const status = result.code === 'SMS_NOT_CONFIGURED' ? 503 : 400
      if (result.code === 'TOO_FREQUENT' || result.code === 'IP_LIMIT' || result.code === 'PHONE_LIMIT') {
        return fail(res, 42911, result.message, 429)
      }
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

/** 验证码校验 + 登录/注册，返回与小程序一致的 session（token/user/roles/merchant） */
router.post('/web-auth/login', async (req, res, next) => {
  try {
    const result = await loginWithCode(req.body?.phone, req.body?.code)
    if (!result.ok) {
      if (result.code === 'USE_WECHAT_LOGIN') {
        return fail(res, 40311, result.message, 403)
      }
      if (result.code === 'CODE_EXPIRED' || result.code === 'CODE_WRONG') {
        return fail(res, 40111, result.message, 401)
      }
      return fail(res, 40011, result.message, 400)
    }
    return ok(res, {
      ...result.session,
      isNewUser: result.isNewUser,
      phoneDisplay: result.phoneDisplay,
      needBindWechat: result.needBindWechat,
    })
  } catch (e) {
    return next(e)
  }
})

/** 取一张小程序码。action=login 直接取；action=bind 需已登录（给 phone-only 账号绑微信） */
router.post('/web-auth/wx-code', async (req, res, next) => {
  try {
    const action = req.body?.action === 'bind' ? 'bind' : 'login'
    if (action === 'bind' && !req.auth?.userId) {
      return fail(res, 100002, '未授权', 401)
    }
    const result = await createTicket({ action, userId: req.auth?.userId || '' })
    return ok(res, result)
  } catch (e) {
    return next(e)
  }
})

/** web 轮询扫码结果；确认后一次消费并返回会话 */
router.get('/web-auth/wx-code/status', async (req, res, next) => {
  try {
    const result = await consumeTicket(req.query?.ticket)
    return ok(res, result)
  } catch (e) {
    return next(e)
  }
})

/** 小程序端扫码后确认（确认页带着小程序登录态调用） */
router.post('/web-auth/wx-code/confirm', requireAuth(), async (req, res, next) => {
  try {
    const result = await confirmTicket(req.body?.ticket, req.auth.userId)
    return ok(res, result)
  } catch (e) {
    return next(e)
  }
})

/** 换号找回旧账号：验证旧号验证码 → 旧账号资产迁到当前账号 → 旧账号作废 */
router.post('/web-auth/recover-old-account', requireAuth(), async (req, res, next) => {
  try {
    const result = await recoverOldAccount({
      userId: req.auth.userId,
      oldPhone: req.body?.oldPhone,
      code: req.body?.code,
    })
    if (!result.ok) {
      if (result.code === 'CODE_EXPIRED' || result.code === 'CODE_WRONG') {
        return fail(res, 40111, result.message, 401)
      }
      return fail(res, 40011, result.message, 400)
    }
    return ok(res, { ...result.session })
  } catch (e) {
    return next(e)
  }
})

module.exports = { router }
