const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { resolveStoreId } = require('../lib/merchant-request')
const {
  listMerchantAlbumReviews,
  fetchMerchantReviewStats,
  getMerchantAlbumReviewById,
  replyMerchantAlbumReview,
} = require('../services/album-review.service')

const router = express.Router()

router.get('/reviews/stats', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await fetchMerchantReviewStats(storeId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/reviews', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const list = await listMerchantAlbumReviews(storeId, req.query.tab)
    return ok(res, { list })
  } catch (e) {
    next(e)
  }
})

router.get('/reviews/:reviewId', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await getMerchantAlbumReviewById(req.params.reviewId, storeId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/reviews/:reviewId/reply', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await replyMerchantAlbumReview(
      req.params.reviewId,
      storeId,
      req.auth.userId,
      req.body || {},
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
