const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const {
  devWechatLogin,
  devBindPhone,
  fetchMineSummary,
} = require('../services/auth.service')

const router = express.Router()

router.post('/auth/wechat-login', async (req, res, next) => {
  try {
    const data = await devWechatLogin(req.body?.code)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/auth/bind-phone', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await devBindPhone(req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/auth/logout', requireAuth(['user']), async (req, res, next) => {
  try {
    return ok(res, { ok: true })
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
