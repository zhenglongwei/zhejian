const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const {
  listMerchantServiceAlbums,
  getMerchantServiceAlbum,
  createMerchantServiceAlbum,
  saveMerchantServiceAlbum,
  completeMerchantServiceAlbum,
  fetchMerchantAlbumStats,
} = require('../services/service-album.service')
const { ensureOrderPreMaskTask } = require('../services/desensitize.service')

const router = express.Router()

const DEFAULT_STORE = 'store_demo_1'

function resolveStoreId(req) {
  return req.query.storeId || req.body?.storeId || DEFAULT_STORE
}

router.get('/service-albums', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const list = await listMerchantServiceAlbums(storeId, req.query)
    return ok(res, list)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/stats', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await fetchMerchantAlbumStats(storeId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await createMerchantServiceAlbum(
      req.auth.merchantId,
      storeId,
      req.body || {}
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/:albumId', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await getMerchantServiceAlbum(req.params.albumId, storeId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await saveMerchantServiceAlbum(
      req.params.albumId,
      storeId,
      req.body || {}
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/complete', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    await completeMerchantServiceAlbum(req.params.albumId, storeId)
    const preMaskTask = await ensureOrderPreMaskTask(req.params.albumId)
    return ok(res, {
      albumId: req.params.albumId,
      albumStatus: 'completed',
      preMaskTaskId: preMaskTask.taskId,
      preMaskStatus: preMaskTask.preMaskStatus,
    })
  } catch (e) {
    next(e)
  }
})

/** @deprecated 兼容旧路径，转发至 service-albums/complete */
router.post('/albums/:albumId/complete', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    await completeMerchantServiceAlbum(req.params.albumId, storeId)
    const preMaskTask = await ensureOrderPreMaskTask(req.params.albumId)
    return ok(res, {
      albumId: req.params.albumId,
      albumStatus: 'completed',
      preMaskTaskId: preMaskTask.taskId,
      preMaskStatus: preMaskTask.preMaskStatus,
    })
  } catch (e) {
    next(e)
  }
})

module.exports = router
