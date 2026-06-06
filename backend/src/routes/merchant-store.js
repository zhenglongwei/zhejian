const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { updateStoreDisplayProfile } = require('../services/merchant-store.service')

const router = express.Router()

router.put('/store', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const profile = await updateStoreDisplayProfile(req.auth, req.body || {})
    return ok(res, profile)
  } catch (e) {
    next(e)
  }
})

module.exports = router
