const express = require('express')
const { ok } = require('../lib/response')
const { createH5Lead } = require('../services/h5-lead.service')
const { resolveCaseRedirectTarget } = require('../services/h5-case-redirect.service')
const { getCityPagePayload } = require('../services/h5-city.service')
const { getStoreCasesPagePayload } = require('../services/h5-store-cases.service')
const { getServiceItemPagePayload } = require('../services/h5-service-item.service')
const { getServiceItemCasesPagePayload } = require('../services/h5-service-item-cases.service')
const { resolveTopicRedirectTarget } = require('../services/h5-topic-redirect.service')
const {
  getSitemapIndexXml,
  getSitemapXmlByType,
  getRobotsTxt,
} = require('../services/h5-sitemap.service')
const { getLlmsTxt, getTopicsFeedXml } = require('../services/h5-discovery.service')
const {
  searchH5Content,
  getH5SearchSuggest,
  getH5SearchConfig,
} = require('../services/h5-search.service')
const {
  getCaseFeedJson,
  getServiceFeedJson,
  getFeedIndexJson,
  sendFeedJson,
} = require('../services/public-feed.service')

const router = express.Router()

function sendXml(res, body) {
  res.set('Content-Type', 'application/xml; charset=utf-8')
  res.set('Cache-Control', 'public, max-age=3600')
  return res.send(body)
}

function sendText(res, body) {
  res.set('Content-Type', 'text/plain; charset=utf-8')
  res.set('Cache-Control', 'public, max-age=3600')
  return res.send(body)
}

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    return sendXml(res, await getSitemapIndexXml())
  } catch (e) {
    next(e)
  }
})

router.get('/sitemap-:type.xml', async (req, res, next) => {
  try {
    return sendXml(res, await getSitemapXmlByType(req.params.type))
  } catch (e) {
    next(e)
  }
})

router.get('/robots.txt', (req, res) => {
  return sendText(res, getRobotsTxt())
})

router.get('/llms.txt', async (req, res, next) => {
  try {
    return sendText(res, await getLlmsTxt())
  } catch (e) {
    next(e)
  }
})

router.get('/v1/index.json', async (req, res, next) => {
  try {
    return sendFeedJson(res, await getFeedIndexJson())
  } catch (e) {
    next(e)
  }
})

router.get('/v1/cases/:caseId.json', async (req, res, next) => {
  try {
    return sendFeedJson(res, await getCaseFeedJson(req.params.caseId))
  } catch (e) {
    next(e)
  }
})

router.get('/v1/services/:slug.json', async (req, res, next) => {
  try {
    return sendFeedJson(res, await getServiceFeedJson(req.params.slug, req.query))
  } catch (e) {
    next(e)
  }
})

router.get('/feeds/topics.xml', async (req, res, next) => {
  try {
    return sendXml(res, await getTopicsFeedXml())
  } catch (e) {
    next(e)
  }
})

router.get('/h5/cities/:citySlug', async (req, res, next) => {
  try {
    const data = await getCityPagePayload(req.params.citySlug)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/h5/stores/:storeId/cases', async (req, res, next) => {
  try {
    const data = await getStoreCasesPagePayload(req.params.storeId, req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/h5/service-items/:slug/cases', async (req, res, next) => {
  try {
    const data = await getServiceItemCasesPagePayload(req.params.slug, req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/h5/service-items/:slug', async (req, res, next) => {
  try {
    const data = await getServiceItemPagePayload(req.params.slug, req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/h5/topic-redirect/:slug', async (req, res, next) => {
  try {
    const target = await resolveTopicRedirectTarget(req.params.slug)
    if (!target) {
      const err = new Error('专题已合并至服务项目页')
      err.status = 404
      throw err
    }
    return ok(res, target)
  } catch (e) {
    next(e)
  }
})

router.get('/h5/topics/:slug', async (req, res, next) => {
  try {
    const target = await resolveTopicRedirectTarget(req.params.slug)
    if (!target) {
      const err = new Error('专题已合并至服务项目页')
      err.status = 404
      throw err
    }
    return ok(res, { redirect: target, deprecated: true })
  } catch (e) {
    next(e)
  }
})

router.get('/h5/search/config', async (req, res, next) => {
  try {
    const data = await getH5SearchConfig()
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/h5/search/suggest', async (req, res, next) => {
  try {
    const data = await getH5SearchSuggest(req.query.keyword)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/h5/search', async (req, res, next) => {
  try {
    const data = await searchH5Content(req.query)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/h5/case-redirect', async (req, res, next) => {
  try {
    const target = await resolveCaseRedirectTarget(req.query.id)
    res.redirect(target.status, target.location)
  } catch (e) {
    next(e)
  }
})

router.get('/h5/case/:caseId/bot-html', async (req, res, next) => {
  try {
    const { renderCaseBotHtml } = require('../services/h5-case-prerender.service')
    const html = await renderCaseBotHtml(req.params.caseId)
    res.set('Content-Type', 'text/html; charset=utf-8')
    res.set('Cache-Control', 'public, max-age=300')
    return res.send(html)
  } catch (e) {
    next(e)
  }
})

router.post('/h5/leads', async (req, res, next) => {
  try {
    const data = await createH5Lead(req.body || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
