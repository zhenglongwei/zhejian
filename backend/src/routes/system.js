const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { ensureOrderPreMaskTask, getTaskById } = require('../services/desensitize.service')
const { generateAndSaveCaseFaq } = require('../services/case-content.service')
const { generateAndSaveCaseArticle } = require('../services/case-article-generator.service')
const {
  publishCaseArticleToH5,
  backfillPublishedH5ForApprovedCases,
} = require('../services/case-article-publish.service')

const router = express.Router()

router.post('/albums/:albumId/pre-mask', requireAuth(['system', 'merchant']), async (req, res, next) => {
  try {
    const task = await ensureOrderPreMaskTask(req.params.albumId, {
      force: Boolean(req.body && req.body.force),
      auth: req.auth || {},
    })
    return ok(res, task)
  } catch (e) {
    next(e)
  }
})

/** 静态路径须在 /cases/:caseId/* 之前注册，避免被参数路由吞掉 */
router.post('/cases/backfill-published-h5', requireAuth(['system']), async (req, res, next) => {
  try {
    const data = await backfillPublishedH5ForApprovedCases({
      storeId: req.body?.storeId || req.body?.store_id || '',
      limit: req.body?.limit,
    })
    return ok(res, data)
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

router.post('/cases/:caseId/generate-content', requireAuth(['system']), async (req, res, next) => {
  try {
    const data = await generateAndSaveCaseArticle(req.params.caseId, {
      force: Boolean(req.body && req.body.force),
      persist: req.body && req.body.persist === false ? false : true,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/cases/:caseId/publish-h5', requireAuth(['system']), async (req, res, next) => {
  try {
    const data = await publishCaseArticleToH5(req.params.caseId, {
      backfill: true,
      actor: 'system_api',
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
