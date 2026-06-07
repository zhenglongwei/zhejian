const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const {
  listUserFavorites,
  getFavoriteStatus,
  addUserFavorite,
  removeUserFavorite,
} = require('../services/favorite.service')

const router = express.Router()

router.get('/favorites', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await listUserFavorites(req.auth.userId, req.query || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/favorites/status', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await getFavoriteStatus(
      req.auth.userId,
      req.query?.targetType || req.query?.target_type,
      req.query?.targetId || req.query?.target_id
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/favorites', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await addUserFavorite(req.auth.userId, req.body || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.delete('/favorites', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await removeUserFavorite(req.auth.userId, req.body || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
