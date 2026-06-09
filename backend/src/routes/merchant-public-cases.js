const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { resolveStoreId } = require('../lib/merchant-request')
const { fetchMerchantCasePublishPanel } = require('../services/merchant-public-case.service')

const router = express.Router()

router.get('/public-cases/publish-panel', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await fetchMerchantCasePublishPanel(storeId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
