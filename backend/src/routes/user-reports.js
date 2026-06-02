const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { createReport } = require('../services/report.service')

const router = express.Router()

router.post('/reports', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await createReport(req.auth.userId, req.body || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
