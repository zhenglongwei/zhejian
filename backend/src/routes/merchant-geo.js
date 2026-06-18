const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { getMerchantGeoOpportunity } = require('../services/merchant-geo-opportunity.service')

const router = express.Router()

router.get('/geo/opportunity', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const data = await getMerchantGeoOpportunity(req.auth, {
      storeId: req.query.storeId || undefined,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
