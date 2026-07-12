const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { resolveStoreId } = require('../lib/merchant-request')
const {
  listMerchantServiceAlbums,
  getMerchantServiceAlbum,
  createMerchantServiceAlbum,
  saveMerchantServiceAlbum,
  completeMerchantServiceAlbum,
  fetchMerchantCopyQuality,
  fetchMerchantAlbumStats,
  getMerchantAlbumClaimQrcode,
  switchMerchantServiceAlbumTemplate,
  listServiceAlbumTemplateOptions,
} = require('../services/service-album.service')
const { recognizeVehicleIntake } = require('../services/vehicle-intake-ocr.service')
const { ensureOrderPreMaskTask, createMerchantColdStartAuthorizeTaskFromPreMask } = require('../services/desensitize.service')
const { publishMerchantColdStartPublicCase } = require('../services/public-case.service')
const { buildAlbumGeoPreview } = require('../services/album-geo-preview.service')
const {
  fetchAlbumContentOptimizePanel,
  generateAlbumContentOptimizeDraft,
  applyAlbumContentOptimizeDraft,
} = require('../services/album-content-optimize.service')
const {
  runAlbumComplianceGate,
  resubmitAlbumCompliance,
} = require('../services/album-compliance.service')
const {
  getMerchantPlanPartsContext,
  saveMerchantPlanPartsDraft,
  lockMerchantPlanParts,
  unlockMerchantPlanParts,
  runMerchantPlanQuoteOcr,
  recognizePartLabelOcr,
} = require('../services/album-plan-parts.service')

const router = express.Router()

router.get('/service-albums', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const list = await listMerchantServiceAlbums(
      storeId,
      req.query,
      req.auth.merchantId,
    )
    return ok(res, list)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/stats', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await fetchMerchantAlbumStats(storeId, req.auth.merchantId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/templates', requireAuth(['merchant']), async (req, res, next) => {
  try {
    return ok(res, { list: listServiceAlbumTemplateOptions() })
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
      req.body || {},
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/vehicle-ocr', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const data = await recognizeVehicleIntake(req.body?.imageUrl)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/:albumId/claim-qrcode', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await getMerchantAlbumClaimQrcode(
      req.params.albumId,
      storeId,
      req.auth.merchantId,
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/:albumId', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await getMerchantServiceAlbum(
      req.params.albumId,
      storeId,
      req.auth.merchantId,
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/:albumId/plan-parts', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await getMerchantPlanPartsContext(
      req.params.albumId,
      storeId,
      req.auth.merchantId,
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/plan-parts', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await saveMerchantPlanPartsDraft(
      req.params.albumId,
      storeId,
      req.auth.merchantId,
      req.body || {},
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/plan-parts/lock', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await lockMerchantPlanParts(
      req.params.albumId,
      storeId,
      req.auth.merchantId,
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/plan-parts/unlock', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await unlockMerchantPlanParts(
      req.params.albumId,
      storeId,
      req.auth.merchantId,
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/plan-parts/ocr', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await runMerchantPlanQuoteOcr(
      req.params.albumId,
      storeId,
      req.auth.merchantId,
      req.body || {},
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/parts/label-ocr', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const body = req.body || {}
    const imageUrls = Array.isArray(body.imageUrls)
      ? body.imageUrls
      : body.imageUrl
        ? [body.imageUrl]
        : []
    const data = await recognizePartLabelOcr({ imageUrls })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/copy-quality', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await fetchMerchantCopyQuality(
      req.params.albumId,
      storeId,
      req.auth.merchantId,
    )
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
      req.body || {},
      req.auth.merchantId,
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/complete', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const view = await completeMerchantServiceAlbum(
      req.params.albumId,
      storeId,
      req.auth.merchantId,
    )
    const preMaskTask = await ensureOrderPreMaskTask(req.params.albumId, { auth: req.auth || {} })
    const compliance = await runAlbumComplianceGate(req.params.albumId)
    return ok(res, {
      albumId: req.params.albumId,
      albumStatus: 'completed',
      preMaskTaskId: preMaskTask.taskId,
      preMaskStatus: preMaskTask.preMaskStatus,
      complianceStatus: compliance.complianceStatus,
      compliancePassed: compliance.passed,
      complianceRejectReason: compliance.rejectReason || '',
      copyQuality: view.copyQuality || null,
    })
  } catch (e) {
    next(e)
  }
})

router.post(
  '/service-albums/:albumId/compliance-resubmit',
  requireAuth(['merchant']),
  async (req, res, next) => {
    try {
      const storeId = resolveStoreId(req)
      const data = await resubmitAlbumCompliance(
        req.params.albumId,
        storeId,
        req.auth.merchantId,
      )
      return ok(res, data)
    } catch (e) {
      next(e)
    }
  },
)

router.post(
  '/service-albums/:albumId/switch-template',
  requireAuth(['merchant']),
  async (req, res, next) => {
    try {
      const storeId = resolveStoreId(req)
      const templateId = (req.body && req.body.templateId) || ''
      const data = await switchMerchantServiceAlbumTemplate(
        req.params.albumId,
        storeId,
        templateId,
        req.auth.merchantId
      )
      return ok(res, data)
    } catch (e) {
      next(e)
    }
  }
)

router.get('/service-albums/:albumId/geo-preview', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const album = await getMerchantServiceAlbum(req.params.albumId, storeId, req.auth.merchantId)
    const coldStart = !album.userId && !album.userPhone
    const preview = buildAlbumGeoPreview(album, { coldStart })
    return ok(res, preview)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/:albumId/content-optimize', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await fetchAlbumContentOptimizePanel(
      req.params.albumId,
      storeId,
      req.auth.merchantId
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post(
  '/service-albums/:albumId/content-optimize/generate',
  requireAuth(['merchant']),
  async (req, res, next) => {
    try {
      const storeId = resolveStoreId(req)
      const data = await generateAlbumContentOptimizeDraft(
        req.params.albumId,
        storeId,
        req.auth.merchantId
      )
      return ok(res, data)
    } catch (e) {
      next(e)
    }
  }
)

router.post(
  '/service-albums/:albumId/content-optimize/apply',
  requireAuth(['merchant']),
  async (req, res, next) => {
    try {
      const storeId = resolveStoreId(req)
      const data = await applyAlbumContentOptimizeDraft(
        req.params.albumId,
        storeId,
        req.auth.merchantId
      )
      return ok(res, data)
    } catch (e) {
      next(e)
    }
  }
)

router.post('/service-albums/:albumId/cold-start-preview', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    await getMerchantServiceAlbum(req.params.albumId, storeId, req.auth.merchantId)
    const { preview, task } = await createMerchantColdStartAuthorizeTaskFromPreMask(req.params.albumId)
    return ok(res, { ...preview, task })
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/public-case', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await publishMerchantColdStartPublicCase(req.params.albumId, {
      storeId,
      merchantId: req.auth.merchantId,
      taskId: req.body && req.body.taskId,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

/** @deprecated 兼容旧路径，转发至 service-albums/complete */
router.post('/albums/:albumId/complete', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    await completeMerchantServiceAlbum(
      req.params.albumId,
      storeId,
      req.auth.merchantId,
    )
    const preMaskTask = await ensureOrderPreMaskTask(req.params.albumId, { auth: req.auth || {} })
    const compliance = await runAlbumComplianceGate(req.params.albumId)
    return ok(res, {
      albumId: req.params.albumId,
      albumStatus: 'completed',
      preMaskTaskId: preMaskTask.taskId,
      preMaskStatus: preMaskTask.preMaskStatus,
      complianceStatus: compliance.complianceStatus,
      compliancePassed: compliance.passed,
      complianceRejectReason: compliance.rejectReason || '',
    })
  } catch (e) {
    next(e)
  }
})

module.exports = router
