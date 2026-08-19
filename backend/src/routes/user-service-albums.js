const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const {
  listUserServiceAlbums,
  getUserServiceAlbum,
  submitServiceAlbumAuthorization,
  fetchUserAuthorizations,
  withdrawAuthorization,
  submitPartConfirm,
  getAlbumClaimPreview,
  claimServiceAlbumByUser,
} = require('../services/service-album.service')
const { publishServicePublicCase } = require('../services/public-case.service')
const { createAlbumAuthorizeTaskFromPreMask } = require('../services/desensitize.service')
const { createAlbumShareToken } = require('../services/album-share.service')
const { submitServiceAlbumFeedback } = require('../services/album-feedback.service')
const {
  getAlbumReviewContext,
  submitServiceAlbumReview,
  submitServiceAlbumReviewFollowUp,
  setReviewAuthorizePublic,
} = require('../services/album-review.service')
const {
  loadAlbumPartsContext,
  saveAlbumPartVerifications,
} = require('../services/album-part-verification.service')
const {
  generateAlbumInspectionAdvice,
  listAlbumInspectionReports,
} = require('../services/album-inspection-advice.service')
const { interpretAlbumThemeCard } = require('../services/album-vision-ondemand.service')
const {
  generateAlbumSocialCopy,
  listSocialPlatforms,
} = require('../services/album-social-copy.service')

const router = express.Router()

router.get('/service-albums', requireAuth(['user']), async (req, res, next) => {
  try {
    const list = await listUserServiceAlbums(req.auth.userId, req.query)
    return ok(res, list)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/authorizations', requireAuth(['user']), async (req, res, next) => {
  try {
    const list = await fetchUserAuthorizations(req.auth.userId)
    return ok(res, list)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/:albumId/claim-preview', async (req, res, next) => {
  try {
    const userId = req.auth?.userId || ''
    const data = await getAlbumClaimPreview(req.params.albumId, userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/claim', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await claimServiceAlbumByUser(
      req.params.albumId,
      req.auth.userId,
      req.body || {},
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/:albumId', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await getUserServiceAlbum(req.params.albumId, req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

/** 车主下载全部原图压缩包（按节点名命名） */
router.get('/service-albums/:albumId/archive', requireAuth(['user']), async (req, res, next) => {
  try {
    const { buildOwnerAlbumArchive } = require('../services/album-owner-archive.service')
    const archive = await buildOwnerAlbumArchive(req.params.albumId, req.auth.userId)
    const asciiName = 'album-archive.zip'
    const encoded = encodeURIComponent(archive.fileName)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`,
    )
    res.setHeader('X-Image-Count', String(archive.imageCount))
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(archive.buffer)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/confirm', requireAuth(['user']), async (req, res, next) => {
  try {
    const { confirmId, ...payload } = req.body || {}
    const data = await submitPartConfirm(
      req.params.albumId,
      req.auth.userId,
      confirmId,
      payload
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/authorization', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await submitServiceAlbumAuthorization(
      req.params.albumId,
      req.auth.userId,
      req.body || {}
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/withdraw-authorization', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await withdrawAuthorization(req.params.albumId, req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/public-case', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await publishServicePublicCase(
      req.params.albumId,
      req.auth.userId,
      req.body || {}
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/public-case/block', requireAuth(['user']), async (req, res, next) => {
  try {
    const { blockPublicCaseByOwner } = require('../services/case-publish-window.service')
    const data = await blockPublicCaseByOwner(req.params.albumId, {
      userId: req.auth.userId,
      rightsToken: req.body && req.body.rightsToken,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/public-case/takedown', requireAuth(['user']), async (req, res, next) => {
  try {
    const { takedownPublicCaseByOwner } = require('../services/case-publish-window.service')
    const data = await takedownPublicCaseByOwner(req.params.albumId, {
      userId: req.auth.userId,
      rightsToken: req.body && req.body.rightsToken,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/albums/:albumId/authorize-preview', requireAuth(['user']), async (req, res, next) => {
  try {
    const { preview } = await createAlbumAuthorizeTaskFromPreMask(req.params.albumId)
    return ok(res, preview)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/share', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await createAlbumShareToken(
      req.params.albumId,
      req.auth.userId,
      req.body || {}
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

/** USER-PUB · 多平台社交媒体长文（车主复制用，不上网） */
router.get('/service-albums/:albumId/social-copy', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await generateAlbumSocialCopy(
      req.params.albumId,
      req.auth.userId,
      req.query.platform
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

/**
 * 车主预览页 · 案例稿图文导出（JSON）
 */
router.get(
  '/service-albums/:albumId/draft-article-export',
  requireAuth(['user']),
  async (req, res, next) => {
    try {
      const { config } = require('../config')
      const {
        buildDraftArticleExport,
      } = require('../utils/merchant-case-draft-article')
      const album = await getUserServiceAlbum(req.params.albumId, req.auth.userId)
      const draft = album && album.merchantCaseDraft
      if (!draft) {
        const err = new Error('案例稿暂不可用')
        err.status = 404
        throw err
      }
      const data = buildDraftArticleExport(draft, {
        publicBaseUrl: config.publicBaseUrl || '',
      })
      return ok(res, data)
    } catch (e) {
      next(e)
    }
  },
)

router.get('/social-copy/platforms', requireAuth(['user']), async (req, res, next) => {
  try {
    return ok(res, { platforms: listSocialPlatforms() })
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/feedback', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await submitServiceAlbumFeedback(
      req.params.albumId,
      req.auth.userId,
      req.body || {}
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/:albumId/review', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await getAlbumReviewContext(req.params.albumId, req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/review', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await submitServiceAlbumReview(
      req.params.albumId,
      req.auth.userId,
      req.body || {},
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post(
  '/service-albums/:albumId/review/public',
  requireAuth(['user']),
  async (req, res, next) => {
    try {
      const data = await setReviewAuthorizePublic(
        req.params.albumId,
        req.auth.userId,
        Boolean(req.body && req.body.authorizePublic),
      )
      return ok(res, data)
    } catch (e) {
      next(e)
    }
  },
)

router.post(
  '/service-albums/:albumId/review/follow-up',
  requireAuth(['user']),
  async (req, res, next) => {
    try {
      const data = await submitServiceAlbumReviewFollowUp(
        req.params.albumId,
        req.auth.userId,
        req.body || {},
      )
      return ok(res, data)
    } catch (e) {
      next(e)
    }
  },
)

router.post('/service-albums/:albumId/review/image-preview', requireAuth(['user']), async (req, res, next) => {
  try {
    const { prisma } = require('../lib/prisma')
    const { createReviewImagePreviewTask } = require('../services/desensitize.service')
    const review = await prisma.serviceAlbumReview.findUnique({
      where: {
        albumId_userId: {
          albumId: req.params.albumId,
          userId: req.auth.userId,
        },
      },
    })
    if (!review) {
      const err = new Error('请先提交评价')
      err.status = 404
      throw err
    }
    const data = await createReviewImagePreviewTask(review.id, req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/:albumId/part-verifications', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await loadAlbumPartsContext(req.params.albumId, req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/part-verifications', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await saveAlbumPartVerifications(
      req.params.albumId,
      req.auth.userId,
      req.body || {},
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/service-albums/:albumId/inspection-reports', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await listAlbumInspectionReports(
      req.params.albumId,
      req.auth.userId,
      { limit: req.query.limit },
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/service-albums/:albumId/inspection-advice', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await generateAlbumInspectionAdvice(
      req.params.albumId,
      req.auth.userId,
      req.body || {},
    )
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

/** PUB-GEO · 主题卡按需「AI 解读」（M2：不在上传时触发） */
router.post('/service-albums/:albumId/vision/interpret', requireAuth(['user']), async (req, res, next) => {
  try {
    const body = req.body || {}
    const data = await interpretAlbumThemeCard({
      albumId: req.params.albumId,
      audience: 'owner',
      cardKey: body.cardKey || body.card_key || '',
      itemKeys: body.itemKeys || body.item_keys || [],
      forceRefresh: Boolean(body.forceRefresh || body.force_refresh),
      userId: req.auth.userId,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
