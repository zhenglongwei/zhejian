const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { requireAdmin } = require('../middleware/require-admin')
const { config } = require('../config')
const {
  listAdminCases,
  getAdminCaseDetail,
  approveAdminCase,
  rejectAdminCase,
  requestModifyAdminCase,
} = require('../services/admin-case.service')

const router = express.Router()

router.post('/auth/login', async (req, res, next) => {
  try {
    const password = String(req.body?.password || '')
    if (!password || password !== config.adminPassword) {
      const err = new Error('账号或密码错误')
      err.status = 401
      throw err
    }
    return ok(res, {
      token: config.devTokens.admin,
      expiresIn: config.jwt.expiresIn,
    })
  } catch (e) {
    next(e)
  }
})

router.use(requireAuth(['system']), requireAdmin)

router.get('/cases', async (req, res, next) => {
  try {
    const data = await listAdminCases(req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/cases/:caseId', async (req, res, next) => {
  try {
    const data = await getAdminCaseDetail(req.params.caseId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/cases/:caseId/approve', async (req, res, next) => {
  try {
    const data = await approveAdminCase(req.params.caseId, {
      reviewerId: req.admin?.reviewerId,
      comment: req.body?.comment || '',
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/cases/:caseId/reject', async (req, res, next) => {
  try {
    const data = await rejectAdminCase(req.params.caseId, {
      reviewerId: req.admin?.reviewerId,
      comment: req.body?.comment || '',
      reasonType: req.body?.reasonType || '',
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/cases/:caseId/request-modify', async (req, res, next) => {
  try {
    const data = await requestModifyAdminCase(req.params.caseId, {
      reviewerId: req.admin?.reviewerId,
      comment: req.body?.comment || '',
      reasonType: req.body?.reasonType || '',
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
