const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { resolveStoreId } = require('../lib/merchant-request')
const { fetchMerchantCasePublishPanel } = require('../services/merchant-public-case.service')
const { exportCaseArticleForWechat } = require('../services/case-article-export.service')

const router = express.Router()

router.get('/public-cases/publish-panel', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await fetchMerchantCasePublishPanel(storeId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/public-cases/:caseId/article-export', requireAuth(['merchant']), async (req, res, next) => {
  try {
    const storeId = resolveStoreId(req)
    const data = await exportCaseArticleForWechat(req.params.caseId, {
      storeId,
      requirePublishedH5: true,
    })
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
