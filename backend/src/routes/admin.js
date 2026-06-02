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
  retryAdminCaseAsset,
  retryAllAdminCaseAssets,
} = require('../services/admin-case.service')

const {
  listAdminMerchants,
  getAdminMerchantDetail,
  approveAdminMerchant,
  rejectAdminMerchant,
  requestModifyAdminMerchant,
} = require('../services/admin-merchant.service')

const {
  listAdminServicePlans,
  getAdminServicePlanDetail,
  recordSpotCheckServicePlan,
  suspendAdminServicePlan,
  forceUnpublishAdminServicePlan,
  limitAppointmentAdminServicePlan,
  restoreAdminServicePlan,
} = require('../services/admin-service-plan.service')

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

router.post('/cases/:caseId/assets/:assetId/retry-desensitize', async (req, res, next) => {
  try {
    const data = await retryAdminCaseAsset(req.params.caseId, req.params.assetId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/cases/:caseId/retry-desensitize-all', async (req, res, next) => {
  try {
    const data = await retryAllAdminCaseAssets(req.params.caseId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/merchants', async (req, res, next) => {
  try {
    const data = await listAdminMerchants(req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/merchants/:merchantId', async (req, res, next) => {
  try {
    const data = await getAdminMerchantDetail(req.params.merchantId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/merchants/:merchantId/approve', async (req, res, next) => {
  try {
    const data = await approveAdminMerchant(req.params.merchantId, {
      reviewerId: req.admin?.reviewerId,
      comment: req.body?.comment || '',
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/merchants/:merchantId/reject', async (req, res, next) => {
  try {
    const data = await rejectAdminMerchant(req.params.merchantId, {
      reviewerId: req.admin?.reviewerId,
      comment: req.body?.comment || '',
      reasonType: req.body?.reasonType || '',
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/merchants/:merchantId/request-modify', async (req, res, next) => {
  try {
    const data = await requestModifyAdminMerchant(req.params.merchantId, {
      reviewerId: req.admin?.reviewerId,
      comment: req.body?.comment || '',
      reasonType: req.body?.reasonType || '',
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/services', async (req, res, next) => {
  try {
    const data = await listAdminServicePlans(req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/services/:planId', async (req, res, next) => {
  try {
    const data = await getAdminServicePlanDetail(req.params.planId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/services/:planId/spot-check', async (req, res, next) => {
  try {
    const data = await recordSpotCheckServicePlan(req.params.planId, {
      reviewerId: req.admin?.reviewerId,
      comment: req.body?.comment || '',
      result: req.body?.result || 'pass',
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/services/:planId/suspend', async (req, res, next) => {
  try {
    const data = await suspendAdminServicePlan(req.params.planId, {
      reviewerId: req.admin?.reviewerId,
      comment: req.body?.comment || '',
      reasonType: req.body?.reasonType || '',
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/services/:planId/force-unpublish', async (req, res, next) => {
  try {
    const data = await forceUnpublishAdminServicePlan(req.params.planId, {
      reviewerId: req.admin?.reviewerId,
      comment: req.body?.comment || '',
      reasonType: req.body?.reasonType || '',
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/services/:planId/limit-appointment', async (req, res, next) => {
  try {
    const data = await limitAppointmentAdminServicePlan(req.params.planId, {
      reviewerId: req.admin?.reviewerId,
      comment: req.body?.comment || '',
      reasonType: req.body?.reasonType || '',
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/services/:planId/restore', async (req, res, next) => {
  try {
    const data = await restoreAdminServicePlan(req.params.planId, {
      reviewerId: req.admin?.reviewerId,
      comment: req.body?.comment || '',
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
