const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const {
  fetchLeadConfirm,
  createLead,
  listUserLeads,
  getUserLeadById,
  cancelUserLead,
} = require('../services/lead.service')
const { buildAuthMetaFromReq } = require('../lib/auth-request-meta')

const router = express.Router()

router.get('/leads/confirm', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await fetchLeadConfirm(req.auth.userId, req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/leads', requireAuth(['user']), async (req, res, next) => {
  try {
    const list = await listUserLeads(req.auth.userId, req.query.tab)
    return ok(res, { list })
  } catch (e) {
    next(e)
  }
})

router.post('/leads', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await createLead(
      req.auth.userId,
      req.body || {},
      buildAuthMetaFromReq(req)
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/leads/:leadId', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await getUserLeadById(req.auth.userId, req.params.leadId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/leads/:leadId/cancel', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await cancelUserLead(req.auth.userId, req.params.leadId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
