const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { fetchMerchantSubscriptionPanel } = require('../services/merchant-subscription.service')
const {
  createSubscriptionOrder,
  prepaySubscriptionOrder,
  mockPaySubscriptionOrder,
} = require('../services/merchant-payment.service')

const router = express.Router()

router.get('/subscription', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const data = await fetchMerchantSubscriptionPanel(req.auth)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/subscription/orders', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const data = await createSubscriptionOrder(req.auth, req.body?.plan, {
      intent: req.body?.intent,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/subscription/orders/:orderId/prepay', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const data = await prepaySubscriptionOrder(req.auth, req.params.orderId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/subscription/orders/:orderId/mock-pay', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const data = await mockPaySubscriptionOrder(req.auth, req.params.orderId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
