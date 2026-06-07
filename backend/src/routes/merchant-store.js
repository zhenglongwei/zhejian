const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { updateStoreDisplayProfile } = require('../services/merchant-store.service')
const { listMerchantStoresForUser } = require('../services/merchant-context.service')

const router = express.Router()

router.get('/stores', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const list = await listMerchantStoresForUser(
      req.auth.userId,
      req.auth.merchantId,
      req.auth.storeId || ''
    )
    return ok(res, { list, total: list.length })
  } catch (e) {
    next(e)
  }
})

router.put('/store', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const profile = await updateStoreDisplayProfile(req.auth, req.body || {})
    return ok(res, profile)
  } catch (e) {
    next(e)
  }
})

module.exports = router
