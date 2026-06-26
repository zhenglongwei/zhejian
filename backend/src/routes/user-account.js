const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const {
  fetchDeactivateCheck,
  deactivateAccount,
} = require('../services/account-deactivate.service')

const router = express.Router()

router.get('/account/deactivate-check', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await fetchDeactivateCheck(req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/account/deactivate', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await deactivateAccount(req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
