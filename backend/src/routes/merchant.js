const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { completeMerchantAlbum } = require('../services/album.service')
const { ensureOrderPreMaskTask, getTaskById } = require('../services/desensitize.service')

const router = express.Router()

router.post('/albums/:albumId/complete', requireAuth(['merchant']), async (req, res, next) => {
  try {
    await completeMerchantAlbum(req.params.albumId)
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
