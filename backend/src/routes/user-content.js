const express = require('express')
const { ok } = require('../lib/response')
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
const { getSharedAlbumByToken } = require('../services/album-share.service')

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
    const data = await getCaseDetail(req.params.id)
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
    const data = await getServiceDetail(req.params.id)
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

module.exports = router
