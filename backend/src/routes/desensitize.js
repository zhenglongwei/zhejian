const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const {
  getTaskById,
  runAutoMask,
  retryAsset,
  applyManualMask,
  markAssetPreviewed,
  confirmOrderAuthorizeTask,
  confirmReviewImagePreviewTask,
} = require('../services/desensitize.service')
const { BIZ_TYPE } = require('../services/desensitize.constants')

const router = express.Router()

router.get('/tasks/:taskId', requireAuth(['user', 'merchant', 'system']), async (req, res, next) => {
  try {
    const task = await getTaskById(req.params.taskId, { roles: req.auth?.roles || [] })
    if (!task) {
      const err = new Error('脱敏任务不存在')
      err.status = 404
      throw err
    }
    return ok(res, task)
  } catch (e) {
    next(e)
  }
})

router.post('/tasks/:taskId/auto-mask', requireAuth(['user', 'merchant']), async (req, res, next) => {
  try {
    const task = await runAutoMask(req.params.taskId)
    return ok(res, task)
  } catch (e) {
    next(e)
  }
})

router.post('/tasks/:taskId/assets/:assetId/retry', requireAuth(['user', 'merchant']), async (req, res, next) => {
  try {
    const task = await retryAsset(req.params.taskId, req.params.assetId)
    return ok(res, task)
  } catch (e) {
    next(e)
  }
})

router.post(
  '/tasks/:taskId/assets/:assetId/manual-mask',
  requireAuth(['user', 'merchant']),
  async (req, res, next) => {
    try {
      const task = await applyManualMask(req.params.taskId, req.params.assetId, {
        regions: req.body && req.body.regions,
        mode: req.body && req.body.mode,
      })
      return ok(res, task)
    } catch (e) {
      next(e)
    }
  }
)

router.post('/tasks/:taskId/assets/:assetId/previewed', requireAuth(['user', 'merchant']), async (req, res, next) => {
  try {
    const task = await markAssetPreviewed(req.params.taskId, req.params.assetId)
    return ok(res, task)
  } catch (e) {
    next(e)
  }
})

router.post('/tasks/:taskId/confirm', requireAuth(['user', 'merchant']), async (req, res, next) => {
  try {
    const task = await getTaskById(req.params.taskId)
    if (!task) {
      const err = new Error('脱敏任务不存在')
      err.status = 404
      throw err
    }
    const payload = {
      liabilityAccepted: Boolean(req.body && req.body.liabilityAccepted),
    }
    let confirmed
    if (task.bizType === BIZ_TYPE.SERVICE_REVIEW_PREVIEW) {
      confirmed = await confirmReviewImagePreviewTask(req.params.taskId, payload)
    } else {
      confirmed = await confirmOrderAuthorizeTask(req.params.taskId, payload)
    }
    return ok(res, { task: confirmed })
  } catch (e) {
    next(e)
  }
})

module.exports = router
