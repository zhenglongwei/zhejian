const express = require('express')
const { ok } = require('../lib/response')
const { createH5Lead } = require('../services/h5-lead.service')
const { resolveCaseRedirectTarget } = require('../services/h5-case-redirect.service')
const { getCityPagePayload } = require('../services/h5-city.service')
const { getStoreCasesPagePayload } = require('../services/h5-store-cases.service')
const { getServiceItemPagePayload } = require('../services/h5-service-item.service')

const router = express.Router()

router.get('/h5/cities/:citySlug', async (req, res, next) => {
  try {
    const data = await getCityPagePayload(req.params.citySlug)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/h5/stores/:storeId/cases', async (req, res, next) => {
  try {
    const data = await getStoreCasesPagePayload(req.params.storeId, req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/h5/service-items/:slug', async (req, res, next) => {
  try {
    const data = await getServiceItemPagePayload(req.params.slug)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

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
