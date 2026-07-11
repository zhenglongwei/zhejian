const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { requireAdmin } = require('../middleware/require-admin')
const { config } = require('../config')
const { signSystemToken } = require('../lib/jwt')
const {
  listAdminCases,
  getAdminCaseDetail,
  approveAdminCase,
  rejectAdminCase,
  requestModifyAdminCase,
  retryAdminCaseAsset,
  retryAllAdminCaseAssets,
  updateAdminCaseFaqLinks,
} = require('../services/admin-case.service')
const {
  setAdminGeoPageStatus,
  listAdminGeoPages,
  getAdminGeoPageDetail,
  createAdminGeoPage,
  updateAdminGeoPage,
  getGeoFaqTemplate,
} = require('../services/admin-geo-page.service')
const {
  updateAdminCaseGeoContent,
  updateAdminCaseEnrichment,
  regenerateAdminCaseArticle,
} = require('../services/admin-case-article.service')
const {
  getAdminCaseGeoLlmDiff,
  adoptAdminCaseGeoLlm,
  rejectAdminCaseGeoLlm,
  triggerAdminCaseGeoLlm,
} = require('../services/admin-case-geo-llm.service')
const { markCaseArticlePublishedWechat } = require('../services/case-article-publish.service')
const { exportCaseArticleForWechat } = require('../services/case-article-export.service')
const { CASE_ARTICLE_STATUS } = require('../constants/case-article-status')
const { getAdminCrawlerStats } = require('../services/admin-crawler-stats.service')
const {
  listAdminGeoPrompts,
  getAdminGeoPrompt,
  createAdminGeoPrompt,
  updateAdminGeoPrompt,
} = require('../services/admin-geo-prompt.service')
const {
  syncGeoPromptSeeds,
  runGeoPromptProbeBatch,
  buildGeoProbeReport,
} = require('../services/geo-prompt-probe.service')
const { buildAdminCitationGaps } = require('../services/admin-geo-citation-gap.service')
const {
  listAdminAlbumCompliance,
  getAdminAlbumComplianceDetail,
  approveAdminAlbumCompliance,
  rejectAdminAlbumCompliance,
} = require('../services/admin-album-compliance.service')

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

const {
  listAdminAuthorizationLogs,
  getAdminAuthorizationLogDetail,
} = require('../services/admin-authorization-log.service')

const router = express.Router()

router.post('/auth/login', async (req, res, next) => {
  try {
    const password = String(req.body?.password || '')
    if (!password || password !== config.adminPassword) {
      const err = new Error('账号或密码错误')
      err.status = 401
      throw err
    }
    let token
    if (config.jwt.secret) {
      token = signSystemToken('admin_system')
    } else if (config.devAuthEnabled) {
      token = config.devTokens.admin
    } else {
      const err = new Error('服务未配置 JWT_SECRET，无法签发运营登录令牌')
      err.status = 503
      throw err
    }
    return ok(res, {
      token,
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

router.get('/album-compliance', async (req, res, next) => {
  try {
    const data = await listAdminAlbumCompliance(req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/album-compliance/:albumId', async (req, res, next) => {
  try {
    const data = await getAdminAlbumComplianceDetail(req.params.albumId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/album-compliance/:albumId/approve', async (req, res, next) => {
  try {
    const data = await approveAdminAlbumCompliance(
      req.params.albumId,
      req.admin?.reviewerId || 'admin',
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/album-compliance/:albumId/reject', async (req, res, next) => {
  try {
    const data = await rejectAdminAlbumCompliance(
      req.params.albumId,
      req.body || {},
      req.admin?.reviewerId || 'admin',
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/cases/:caseId/article-export', async (req, res, next) => {
  try {
    const data = await exportCaseArticleForWechat(req.params.caseId)
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

router.put('/cases/:caseId/faq', async (req, res, next) => {
  try {
    const data = await updateAdminCaseFaqLinks(req.params.caseId, {
      faq: req.body?.faq,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.put('/cases/:caseId/geo-content', async (req, res, next) => {
  try {
    const data = await updateAdminCaseGeoContent(req.params.caseId, req.body || {}, {
      reviewerId: req.admin?.reviewerId,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.put('/cases/:caseId/enrichment', async (req, res, next) => {
  try {
    const data = await updateAdminCaseEnrichment(req.params.caseId, req.body || {}, {
      reviewerId: req.admin?.reviewerId,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/cases/:caseId/regenerate-article', async (req, res, next) => {
  try {
    const data = await regenerateAdminCaseArticle(req.params.caseId, {
      reviewerId: req.admin?.reviewerId,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/cases/:caseId/geo-llm-diff', async (req, res, next) => {
  try {
    const data = await getAdminCaseGeoLlmDiff(req.params.caseId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/cases/:caseId/geo-llm-adopt', async (req, res, next) => {
  try {
    const data = await adoptAdminCaseGeoLlm(req.params.caseId, {
      reviewerId: req.admin?.reviewerId,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/cases/:caseId/geo-llm-reject', async (req, res, next) => {
  try {
    const data = await rejectAdminCaseGeoLlm(req.params.caseId, {
      reviewerId: req.admin?.reviewerId,
      comment: req.body?.comment || '',
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/cases/:caseId/geo-llm-run', async (req, res, next) => {
  try {
    const data = await triggerAdminCaseGeoLlm(req.params.caseId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/geo-pages', async (req, res, next) => {
  try {
    const data = await listAdminGeoPages(req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/geo-pages/faq-template', async (req, res, next) => {
  try {
    const data = getGeoFaqTemplate(req.query.pageType, req.query.serviceId, {
      city: req.query.city,
      title: req.query.title,
    })
    return ok(res, { faq: data })
  } catch (e) {
    next(e)
  }
})

router.get('/geo-pages/:pageId', async (req, res, next) => {
  try {
    const data = await getAdminGeoPageDetail(req.params.pageId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/geo-pages', async (req, res, next) => {
  try {
    const data = await createAdminGeoPage(req.body || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.put('/geo-pages/:pageId', async (req, res, next) => {
  try {
    const data = await updateAdminGeoPage(req.params.pageId, req.body || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/geo-pages/:pageId/publish', async (req, res, next) => {
  try {
    const data = await setAdminGeoPageStatus(req.params.pageId, 'published')
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/geo-pages/:pageId/unpublish', async (req, res, next) => {
  try {
    const data = await setAdminGeoPageStatus(req.params.pageId, 'draft')
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/geo/crawler-stats', async (req, res, next) => {
  try {
    const data = await getAdminCrawlerStats(req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/geo/citation-gaps', async (req, res, next) => {
  try {
    const data = await buildAdminCitationGaps(req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/geo/vehicle-topic-seeds', async (req, res, next) => {
  try {
    const { buildAdminVehicleTopicSeeds } = require('../services/admin-geo-vehicle-topic-seeds.service')
    const data = await buildAdminVehicleTopicSeeds(req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/geo/vehicle-topic-seeds/:slug/draft', async (req, res, next) => {
  try {
    const { createAdminGeoPageDraftFromVehicleSeed } = require('../services/admin-geo-vehicle-topic-seeds.service')
    const data = await createAdminGeoPageDraftFromVehicleSeed(req.params.slug)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/geo/probe-report', async (req, res, next) => {
  try {
    const data = await buildGeoProbeReport(req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/geo/probe-run', async (req, res, next) => {
  try {
    const engines = Array.isArray(req.body?.engines)
      ? req.body.engines
      : typeof req.body?.engines === 'string'
        ? req.body.engines.split(/[,;\s]+/).filter(Boolean)
        : undefined
    const data = await runGeoPromptProbeBatch({
      limit: req.body?.limit,
      promptIds: req.body?.promptIds,
      engines,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/geo/probe-seed-sync', async (req, res, next) => {
  try {
    const data = await syncGeoPromptSeeds()
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/geo/prompts', async (req, res, next) => {
  try {
    const data = await listAdminGeoPrompts(req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/geo/prompts/:promptId', async (req, res, next) => {
  try {
    const data = await getAdminGeoPrompt(req.params.promptId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/geo/prompts', async (req, res, next) => {
  try {
    const data = await createAdminGeoPrompt(req.body)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.put('/geo/prompts/:promptId', async (req, res, next) => {
  try {
    const data = await updateAdminGeoPrompt(req.params.promptId, req.body)
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

router.post('/merchants/:merchantId/subscription/activate', async (req, res, next) => {
  try {
    const { activateMerchantPlan, MERCHANT_PLAN } = require('../services/merchant-subscription.service')
    const plan = req.body?.plan || MERCHANT_PLAN.INDEX_99
    const data = await activateMerchantPlan(req.params.merchantId, plan, {
      founderFlag: req.body?.founderFlag,
      founderRenewDiscount: req.body?.founderRenewDiscount,
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

router.get('/authorization-logs', async (req, res, next) => {
  try {
    const data = await listAdminAuthorizationLogs(req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/authorization-logs/:logId', async (req, res, next) => {
  try {
    const data = await getAdminAuthorizationLogDetail(req.params.logId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
