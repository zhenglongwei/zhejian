const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { submitAlbumAuthorization } = require('../services/album.service')

const router = express.Router()

router.post('/albums/:albumId/authorization', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await submitAlbumAuthorization(req.params.albumId, req.body || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
