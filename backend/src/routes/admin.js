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
const { markCaseArticlePublishedWechat } = require('../services/case-article-publish.service')
const { CASE_ARTICLE_STATUS } = require('../constants/case-article-status')

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

const {
  listAdminReports,
  getAdminReportDetail,
  acceptAdminReport,
  rejectAdminReport,
  resolveAdminReport,
} = require('../services/admin-report.service')

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

router.post('/cases/:caseId/article-status', async (req, res, next) => {
  try {
    const targetStatus = String(req.body?.targetStatus || req.body?.target_status || '').trim()
    if (targetStatus !== CASE_ARTICLE_STATUS.PUBLISHED_WECHAT) {
      const err = new Error('仅支持标记为 published_wechat')
      err.status = 400
      throw err
    }
    const data = await markCaseArticlePublishedWechat(req.params.caseId, {
      actor: req.admin?.reviewerId || 'admin',
    })
    const detail = await getAdminCaseDetail(req.params.caseId)
    return ok(res, { ...data, case: detail })
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

router.get('/reports', async (req, res, next) => {
  try {
    const data = await listAdminReports(req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/reports/:reportId', async (req, res, next) => {
  try {
    const data = await getAdminReportDetail(req.params.reportId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/reports/:reportId/accept', async (req, res, next) => {
  try {
    const data = await acceptAdminReport(req.params.reportId, {
      reviewerId: req.admin?.reviewerId,
      comment: req.body?.comment || '',
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/reports/:reportId/reject', async (req, res, next) => {
  try {
    const data = await rejectAdminReport(req.params.reportId, {
      reviewerId: req.admin?.reviewerId,
      comment: req.body?.comment || '',
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/reports/:reportId/resolve', async (req, res, next) => {
  try {
    const data = await resolveAdminReport(req.params.reportId, {
      reviewerId: req.admin?.reviewerId,
      comment: req.body?.comment || '',
      hideContent: Boolean(req.body?.hideContent),
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
