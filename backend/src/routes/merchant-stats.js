const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { fetchMerchantStats } = require('../services/merchant-daily-stats.service')
const router = express.Router()

router.get('/stats', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const data = await fetchMerchantStats(req.auth, {
      storeId: req.query.storeId || undefined,
      period: req.query.period,
      from: req.query.from,
      to: req.query.to,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
