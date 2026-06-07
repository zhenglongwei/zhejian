const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const {
  listUserServiceAlbums,
  getUserServiceAlbum,
  submitServiceAlbumAuthorization,
  fetchUserAuthorizations,
  withdrawAuthorization,
  submitPartConfirm,
  getAlbumClaimPreview,
  claimServiceAlbumByUser,
} = require('../services/service-album.service')
const { publishServicePublicCase } = require('../services/public-case.service')
const { createAlbumAuthorizeTaskFromPreMask } = require('../services/desensitize.service')
const { createAlbumShareToken } = require('../services/album-share.service')
const { submitServiceAlbumFeedback } = require('../services/album-feedback.service')

const router = express.Router()

router.get('/service-albums', requireAuth(['user']), async (req, res, next) => {
  try {
    const list = await listUserServiceAlbums(req.auth.userId, req.query)
    return ok(res, list)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/authorizations', requireAuth(['user']), async (req, res, next) => {
  try {
    const list = await fetchUserAuthorizations(req.auth.userId)
    return ok(res, list)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/:albumId/claim-preview', async (req, res, next) => {
  try {
    const userId = req.auth?.userId || ''
    const data = await getAlbumClaimPreview(req.params.albumId, userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/claim', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await claimServiceAlbumByUser(
      req.params.albumId,
      req.auth.userId,
      req.body || {},
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/:albumId', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await getUserServiceAlbum(req.params.albumId, req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/confirm', requireAuth(['user']), async (req, res, next) => {
  try {
    const { confirmId, ...payload } = req.body || {}
    const data = await submitPartConfirm(
      req.params.albumId,
      req.auth.userId,
      confirmId,
      payload
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/authorization', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await submitServiceAlbumAuthorization(
      req.params.albumId,
      req.auth.userId,
      req.body || {}
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/withdraw-authorization', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await withdrawAuthorization(req.params.albumId, req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/public-case', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await publishServicePublicCase(
      req.params.albumId,
      req.auth.userId,
      req.body || {}
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/albums/:albumId/authorize-preview', requireAuth(['user']), async (req, res, next) => {
  try {
    const { preview } = await createAlbumAuthorizeTaskFromPreMask(req.params.albumId)
    return ok(res, preview)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/share', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await createAlbumShareToken(
      req.params.albumId,
      req.auth.userId,
      req.body || {}
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/feedback', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await submitServiceAlbumFeedback(
      req.params.albumId,
      req.auth.userId,
      req.body || {}
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
