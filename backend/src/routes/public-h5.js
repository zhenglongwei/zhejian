const express = require('express')
const { ok } = require('../lib/response')
const { createH5Lead } = require('../services/h5-lead.service')
const { resolveCaseRedirectTarget } = require('../services/h5-case-redirect.service')

const router = express.Router()

router.get('/h5/case-redirect', async (req, res, next) => {
  try {
    const target = await resolveCaseRedirectTarget(req.query.id)
    res.redirect(target.status, target.location)
  } catch (e) {
    next(e)
  }
})

router.post('/h5/leads', async (req, res, next) => {
  try {
    const data = await createH5Lead(req.body || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
