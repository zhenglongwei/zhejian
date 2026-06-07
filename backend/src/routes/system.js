const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { ensureOrderPreMaskTask, getTaskById } = require('../services/desensitize.service')
const { generateAndSaveCaseFaq } = require('../services/case-content.service')

const router = express.Router()

router.post('/albums/:albumId/pre-mask', requireAuth(['system', 'merchant']), async (req, res, next) => {
  try {
    const task = await ensureOrderPreMaskTask(req.params.albumId, {
      force: Boolean(req.body && req.body.force),
    })
    return ok(res, task)
  } catch (e) {
    next(e)
  }
})

router.post('/cases/:caseId/generate-faq', requireAuth(['system']), async (req, res, next) => {
  try {
    const data = await generateAndSaveCaseFaq(req.params.caseId, {
      force: Boolean(req.body && req.body.force),
      persist: req.body && req.body.persist === false ? false : true,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/albums/:albumId/pre-mask-task', requireAuth(['system']), async (req, res, next) => {
  try {
    const taskId = `task_premask_${req.params.albumId}`
    const task = await getTaskById(taskId)
    if (!task) {
      const err = new Error('预脱敏任务不存在')
      err.status = 404
      throw err
    }
    return ok(res, task)
  } catch (e) {
    next(e)
  }
})

module.exports = router
