/**
 * 官网公开登录（挂 /api/v1/public/web-auth）
 *
 * 手机号 + 短信验证码：登录即注册（2026-09-02 老板定）。
 * 复用辙见账号体系——手机号对上已有 user 即同一账号（商家身份自动带上），
 * 没有则新建 phone-only 账号。签发的 JWT 与小程序同一个（双角色）。
 *
 * 该路由的存在意义：让「微信案例转换工具」的配额能按用户等级算
 * （游客 1 次/天、登录 3 次/天），详见 public-wechat-archive.js。
 */

const express = require('express')
const { ok, fail } = require('../lib/response')
const { clientIp } = require('../services/geo-check-rate-limit')
const { sendLoginCode, loginWithCode } = require('../services/web-auth.service')

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
    return ok(res, { resendAfterSec: result.resendAfterSec })
  } catch (e) {
    return next(e)
  }
})

/** 验证码校验 + 登录/注册，返回与小程序一致的 session（token/user/roles/merchant） */
router.post('/web-auth/login', async (req, res, next) => {
  try {
    const result = await loginWithCode(req.body?.phone, req.body?.code)
    if (!result.ok) {
      if (result.code === 'CODE_EXPIRED' || result.code === 'CODE_WRONG') {
        return fail(res, 40111, result.message, 401)
      }
      return fail(res, 40011, result.message, 400)
    }
    return ok(res, {
      ...result.session,
      isNewUser: result.isNewUser,
      phoneDisplay: result.phoneDisplay,
    })
  } catch (e) {
    return next(e)
  }
})

module.exports = { router }
