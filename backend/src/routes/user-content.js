const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const {
  listCases,
  getCaseDetail,
  listMerchants,
  getMerchantDetail,
  listServices,
  getServiceDetail,
  getSearchConfig,
  getSearchSuggest,
  searchContent,
} = require('../services/content.service')
const {
  listUserSearchHistory,
  addUserSearchHistory,
  clearUserSearchHistory,
} = require('../services/search-history.service')
const { getSharedAlbumByToken } = require('../services/album-share.service')
const { listGeoPages, getGeoPageDetail } = require('../services/geo.service')

const router = express.Router()

router.get('/cases', async (req, res, next) => {
  try {
    const data = await listCases(req.query)
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

router.get('/cases/:id', async (req, res, next) => {
  try {
    const relatedStoreOnly =
      req.query.relatedStoreOnly === '1' || req.query.relatedStoreOnly === 'true'
    const data = await getCaseDetail(req.params.id, { relatedStoreOnly })
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

router.get('/shared-albums/:token', async (req, res, next) => {
  try {
    const data = await getSharedAlbumByToken(req.params.token)
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

router.get('/merchants', async (req, res, next) => {
  try {
    const data = await listMerchants(req.query)
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

router.get('/merchants/:id', async (req, res, next) => {
  try {
    const data = await getMerchantDetail(req.params.id)
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

router.get('/services', async (req, res, next) => {
  try {
    const data = await listServices(req.query)
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

router.get('/services/:id', async (req, res, next) => {
  try {
    const sameStoreOnly =
      req.query.sameStoreOnly === '1' ||
      req.query.sameStoreOnly === 'true' ||
      req.query.relatedStoreOnly === '1' ||
      req.query.relatedStoreOnly === 'true'
    const data = await getServiceDetail(req.params.id, { sameStoreOnly })
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

router.get('/geo-pages', async (req, res, next) => {
  try {
    const data = await listGeoPages(req.query)
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

router.get('/geo-pages/:id', async (req, res, next) => {
  try {
    const data = await getGeoPageDetail(req.params.id)
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

router.get('/search/config', async (req, res, next) => {
  try {
    const data = await getSearchConfig()
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

router.get('/search/hotwords', async (req, res, next) => {
  try {
    const data = await getSearchConfig()
    return ok(res, { hotwords: data.hotwords })
  } catch (e) {
    return next(e)
  }
})

router.get('/search/suggest', async (req, res, next) => {
  try {
    const data = await getSearchSuggest(req.query.keyword)
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

router.get('/search', async (req, res, next) => {
  try {
    const query = { ...req.query }
    if (query.filters && typeof query.filters === 'string') {
      try {
        query.filters = JSON.parse(query.filters)
      } catch (e) {
        query.filters = {}
      }
    }
    const data = await searchContent(query)
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

router.get('/search/history', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await listUserSearchHistory(req.auth.userId)
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

router.post('/search/history', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await addUserSearchHistory(req.auth.userId, req.body?.keyword)
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

router.delete('/search/history', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await clearUserSearchHistory(req.auth.userId)
    return ok(res, data)
  } catch (e) {
    return next(e)
  }
})

module.exports = router
