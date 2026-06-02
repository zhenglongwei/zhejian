const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { resolveStoreId } = require('../lib/merchant-request')
const { listServiceItems } = require('../constants/service-catalog')
const {
  listMerchantServicePlans,
  getMerchantServicePlan,
  createMerchantServicePlan,
  updateMerchantServicePlan,
  submitMerchantServicePlan,
  publishMerchantServicePlan,
  unpublishMerchantServicePlan,
} = require('../services/merchant-service-plan.service')

const router = express.Router()

router.get('/service-items', requireAuth(['merchant']), async (req, res, next) => {
  try {
    return ok(res, { list: listServiceItems() })
  } catch (e) {
    next(e)
  }
})

router.get('/service-plans', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await listMerchantServicePlans(req.auth.merchantId, storeId, req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/service-plans/:planId', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await getMerchantServicePlan(
      req.params.planId,
      req.auth.merchantId,
      storeId
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-plans', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await createMerchantServicePlan(
      req.auth.merchantId,
      storeId,
      req.body || {}
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.put('/service-plans/:planId', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await updateMerchantServicePlan(
      req.params.planId,
      req.auth.merchantId,
      storeId,
      req.body || {}
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-plans/:planId/submit', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await submitMerchantServicePlan(
      req.params.planId,
      req.auth.merchantId,
      storeId
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-plans/:planId/publish', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await publishMerchantServicePlan(
      req.params.planId,
      req.auth.merchantId,
      storeId
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-plans/:planId/unpublish', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await unpublishMerchantServicePlan(
      req.params.planId,
      req.auth.merchantId,
      storeId
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
