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

function taskAuthOptions(req) {
  return { auth: req.auth || {} }
}

router.get('/tasks/:taskId', requireAuth(['user', 'merchant', 'system']), async (req, res, next) => {
  try {
    const task = await getTaskById(req.params.taskId, {
      ...taskAuthOptions(req),
      roles: req.auth?.roles || [],
    })
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
    const task = await runAutoMask(req.params.taskId, taskAuthOptions(req))
    return ok(res, task)
  } catch (e) {
    next(e)
  }
})

router.post('/tasks/:taskId/assets/:assetId/retry', requireAuth(['user', 'merchant']), async (req, res, next) => {
  try {
    const task = await retryAsset(req.params.taskId, req.params.assetId, taskAuthOptions(req))
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
      }, taskAuthOptions(req))
      return ok(res, task)
    } catch (e) {
      next(e)
    }
  }
)

router.post('/tasks/:taskId/assets/:assetId/previewed', requireAuth(['user', 'merchant']), async (req, res, next) => {
  try {
    const task = await markAssetPreviewed(req.params.taskId, req.params.assetId, taskAuthOptions(req))
    return ok(res, task)
  } catch (e) {
    next(e)
  }
})

router.post('/tasks/:taskId/confirm', requireAuth(['user', 'merchant']), async (req, res, next) => {
  try {
    const authOpts = taskAuthOptions(req)
    const task = await getTaskById(req.params.taskId, authOpts)
    if (!task) {
      const err = new Error('脱敏任务不存在')
      err.status = 404
      throw err
    }
    const payload = {
      liabilityAccepted: Boolean(req.body && req.body.liabilityAccepted),
      ...authOpts,
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
