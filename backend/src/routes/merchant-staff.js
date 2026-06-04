const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const {
  listMerchantStaff,
  inviteMerchantStaff,
  removeMerchantStaff,
} = require('../services/merchant-staff.service')

const router = express.Router()

router.get('/staff', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const data = await listMerchantStaff(req.auth)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/staff/invite', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const data = await inviteMerchantStaff(req.auth, req.body?.phone)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/staff/:staffId/remove', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const data = await removeMerchantStaff(req.auth, req.params.staffId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
