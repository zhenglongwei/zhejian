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
const {
  getAlbumReviewContext,
  submitServiceAlbumReview,
} = require('../services/album-review.service')
const {
  loadAlbumPartsContext,
  saveAlbumPartVerifications,
} = require('../services/album-part-verification.service')
const {
  generateAlbumInspectionAdvice,
} = require('../services/album-inspection-advice.service')

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

router.get('/service-albums/:albumId/review', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await getAlbumReviewContext(req.params.albumId, req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/review', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await submitServiceAlbumReview(
      req.params.albumId,
      req.auth.userId,
      req.body || {},
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/review/image-preview', requireAuth(['user']), async (req, res, next) => {
  try {
    const { prisma } = require('../lib/prisma')
    const { createReviewImagePreviewTask } = require('../services/desensitize.service')
    const review = await prisma.serviceAlbumReview.findUnique({
      where: {
        albumId_userId: {
          albumId: req.params.albumId,
          userId: req.auth.userId,
        },
      },
    })
    if (!review) {
      const err = new Error('请先提交评价')
      err.status = 404
      throw err
    }
    const data = await createReviewImagePreviewTask(review.id, req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/:albumId/part-verifications', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await loadAlbumPartsContext(req.params.albumId, req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/part-verifications', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await saveAlbumPartVerifications(
      req.params.albumId,
      req.auth.userId,
      req.body || {},
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/inspection-advice', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await generateAlbumInspectionAdvice(
      req.params.albumId,
      req.auth.userId,
      req.body || {},
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
