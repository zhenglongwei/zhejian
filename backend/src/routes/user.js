const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { getUserOrderAlbum } = require('../services/album.service')
const { createOrderAuthorizeTaskFromPreMask } = require('../services/desensitize.service')

const router = express.Router()

router.get('/orders/:orderId/album', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await getUserOrderAlbum(req.params.orderId, req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/orders/:orderId/album/authorize-preview', requireAuth(['user']), async (req, res, next) => {
  try {
    const { preview } = await createOrderAuthorizeTaskFromPreMask(req.params.orderId)
    return ok(res, preview)
  } catch (e) {
    next(e)
  }
})

module.exports = router
