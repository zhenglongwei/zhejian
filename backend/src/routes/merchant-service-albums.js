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
  getMerchantCaseDraft,
  getMerchantCaseDraftMaskStatus,
  saveMerchantCaseDraft,
  polishMerchantCaseDraft,
  confirmAndCompleteMerchantCaseDraft,
  exportMerchantCaseDraftCopy,
  fetchMerchantAlbumStats,
  getMerchantAlbumClaimQrcode,
  switchMerchantServiceAlbumTemplate,
  listServiceAlbumTemplateOptions,
} = require('../services/service-album.service')
const { recognizeVehicleIntake } = require('../services/vehicle-intake-ocr.service')
const { decodeVin } = require('../services/vin-decode.service')
const { createMerchantColdStartAuthorizeTaskFromPreMask } = require('../services/desensitize.service')
const { publishMerchantColdStartPublicCase } = require('../services/public-case.service')
const { buildAlbumGeoPreview } = require('../services/album-geo-preview.service')
const {
  fetchAlbumContentOptimizePanel,
  generateAlbumContentOptimizeDraft,
  applyAlbumContentOptimizeDraft,
} = require('../services/album-content-optimize.service')
const { interpretAlbumThemeCard } = require('../services/album-vision-ondemand.service')
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
    const data = await recognizeVehicleIntake(req.body?.imageUrl, {
      mode: req.body?.mode || req.body?.prefer || req.query?.mode,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

/** ALB-UX-02 · VIN 解码（阿里云市场 sxvin） */
router.get('/service-albums/vin-decode', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const data = await decodeVin(req.query?.vin || req.query?.VIN)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/vin-decode', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const data = await decodeVin(req.body?.vin || req.query?.vin)
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

router.get('/service-albums/:albumId/case-draft/pre-mask', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const retry = ['1', 'true', 'yes'].includes(String((req.query && req.query.retry) || '').toLowerCase())
    const data = await getMerchantCaseDraftMaskStatus(
      req.params.albumId,
      storeId,
      req.auth.merchantId,
      { retry },
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/:albumId/case-draft', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await getMerchantCaseDraft(
      req.params.albumId,
      storeId,
      req.auth.merchantId,
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.put('/service-albums/:albumId/case-draft', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await saveMerchantCaseDraft(
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

router.post('/service-albums/:albumId/case-draft/ai-polish', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await polishMerchantCaseDraft(
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

router.get('/service-albums/:albumId/case-draft/export-copy', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await exportMerchantCaseDraftCopy(
      req.params.albumId,
      storeId,
      req.auth.merchantId,
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post(
  '/service-albums/:albumId/case-draft/confirm-and-complete',
  requireAuth(['merchant']),
  async (req, res, next) => {
    try {
      const storeId = resolveStoreId(req)
      // 旧「确认案例稿并完工」入口：现仅收口相册；案例送审/脱敏另案
      const view = await confirmAndCompleteMerchantCaseDraft(
        req.params.albumId,
        storeId,
        req.auth.merchantId,
        req.body || {},
      )
      return ok(res, {
        ...view,
        albumStatus: 'completed',
        publicCaseStatus: view.publicCaseStatus || 'private',
        preMaskStatus: 'idle',
        caseReviewStatus: 'none',
        complianceStatus: view.complianceStatus || '',
      })
    } catch (e) {
      next(e)
    }
  },
)

router.post(
  '/service-albums/:albumId/generate-case',
  requireAuth(['merchant']),
  async (req, res, next) => {
    try {
      const storeId = resolveStoreId(req)
      const { generateMerchantPublicCase } = require('../services/public-case.service')
      const body = req.body || {}
      const data = await generateMerchantPublicCase(req.params.albumId, {
        storeId,
        merchantId: req.auth.merchantId,
        draft: body.draft || body,
        attest: body.attest || {},
        notifyPhone: body.notifyPhone || body.userPhone || '',
      })
      return ok(res, data)
    } catch (e) {
      next(e)
    }
  },
)

/** PUB-GEO · D14 机审过线后确认发布（不入人审） */
router.post(
  '/service-albums/:albumId/confirm-publish-case',
  requireAuth(['merchant']),
  async (req, res, next) => {
    try {
      const storeId = resolveStoreId(req)
      const { confirmMerchantPublicCasePublish } = require('../services/public-case.service')
      const body = req.body || {}
      const data = await confirmMerchantPublicCasePublish(req.params.albumId, {
        storeId,
        merchantId: req.auth.merchantId,
        draft: body.draft || null,
      })
      return ok(res, data)
    } catch (e) {
      next(e)
    }
  },
)

router.patch(
  '/service-albums/:albumId/notify-phone',
  requireAuth(['merchant']),
  async (req, res, next) => {
    try {
      const storeId = resolveStoreId(req)
      const { updateAlbumNotifyPhone } = require('../services/case-publish-window.service')
      const data = await updateAlbumNotifyPhone(req.params.albumId, {
        storeId,
        merchantId: req.auth.merchantId,
        phone: (req.body && (req.body.phone || req.body.userPhone)) || '',
      })
      return ok(res, data)
    } catch (e) {
      next(e)
    }
  },
)

router.post(
  '/service-albums/:albumId/resend-notify',
  requireAuth(['merchant']),
  async (req, res, next) => {
    try {
      const storeId = resolveStoreId(req)
      const { resendNotifyWindow } = require('../services/case-publish-window.service')
      const data = await resendNotifyWindow(req.params.albumId, {
        storeId,
        merchantId: req.auth.merchantId,
      })
      return ok(res, data)
    } catch (e) {
      next(e)
    }
  },
)

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
    // 完工可先打码，不阻塞本接口；生成预览须等打码就绪
    return ok(res, {
      albumId: req.params.albumId,
      albumStatus: 'completed',
      publicCaseStatus: view.publicCaseStatus || 'private',
      preMaskStatus: 'idle',
      caseReviewStatus: 'none',
      complianceStatus: view.complianceStatus || '',
      compliancePassed: false,
      complianceRejectReason: '',
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
      // 兼容旧入口：驳回后再次确认完工即可重新进审，无需单独合规重提
      const err = new Error('请修改相册与案例稿后，在案例预览页再次「确认并完工」以重新送审')
      err.status = 410
      err.code = 'COMPLIANCE_RESUBMIT_REMOVED'
      throw err
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
    const view = await completeMerchantServiceAlbum(
      req.params.albumId,
      storeId,
      req.auth.merchantId,
    )
    return ok(res, {
      albumId: req.params.albumId,
      albumStatus: 'completed',
      publicCaseStatus: view.publicCaseStatus || 'private',
      preMaskStatus: 'idle',
      caseReviewStatus: 'none',
      complianceStatus: view.complianceStatus || '',
      compliancePassed: false,
      complianceRejectReason: '',
    })
  } catch (e) {
    next(e)
  }
})

/** PUB-GEO · 主题卡按需「AI 对照」（M2：不在上传时触发） */
router.post(
  '/service-albums/:albumId/vision/interpret',
  requireAuth(['merchant']),
  async (req, res, next) => {
    try {
      const storeId = resolveStoreId(req)
      const body = req.body || {}
      const data = await interpretAlbumThemeCard({
        albumId: req.params.albumId,
        audience: 'merchant',
        cardKey: body.cardKey || body.card_key || '',
        itemKeys: body.itemKeys || body.item_keys || [],
        forceRefresh: Boolean(body.forceRefresh || body.force_refresh),
        storeId,
        merchantId: req.auth.merchantId,
      })
      return ok(res, data)
    } catch (e) {
      next(e)
    }
  },
)

module.exports = router
