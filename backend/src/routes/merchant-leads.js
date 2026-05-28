const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const {
  listMerchantLeads,
  getMerchantLeadById,
  markLeadViewed,
  markLeadContacted,
  closeMerchantLead,
  fetchMerchantLeadStats,
} = require('../services/lead.service')

const { resolveStoreId } = require('../lib/merchant-request')

const router = express.Router()

router.get('/leads', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const list = await listMerchantLeads(storeId, req.query.tab)
    return ok(res, { list })
  } catch (e) {
    next(e)
  }
})

router.get('/leads/stats', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await fetchMerchantLeadStats(storeId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/leads/:leadId', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await getMerchantLeadById(req.params.leadId, storeId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/leads/:leadId/view', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await markLeadViewed(
      req.params.leadId,
      storeId,
      req.auth.merchantId
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/leads/:leadId/contact', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await markLeadContacted(
      req.params.leadId,
      storeId,
      req.auth.merchantId,
      req.body?.note || ''
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/leads/:leadId/close', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await closeMerchantLead(
      req.params.leadId,
      storeId,
      req.auth.merchantId,
      req.body || {}
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
