/**
 * GEO-IGAIN-B · 公开 JSON Feed（RAG 友好 · 与页面可见内容一致）
 */
const { config } = require('../config')
const { getCaseDetail } = require('./content.service')
const { getServiceItemPagePayload } = require('./h5-service-item.service')
const { resolveH5ServiceItemBySlug } = require('../constants/h5-service-items')
const { STORE_CHECK_HINT } = require('../constants/geo-faq-templates')
const { getLlmsTxt } = require('./h5-discovery.service')
const { buildServicePageSchemaGraph } = require('../lib/schema-graph')

const FEED_DISCLAIMER =
  '数据来自已授权且脱敏的公开案例，仅供参考，不构成线上报价或维修承诺。'

function sendFeedJson(res, body) {
  res.set('Content-Type', 'application/json; charset=utf-8')
  res.set('Cache-Control', 'public, max-age=300')
  return res.json(body)
}

function isIndexableSeo(seo) {
  if (!seo) return false
  if (seo.allowIndex === false) return false
  return String(seo.robots || '').toLowerCase().startsWith('index')
}

function mapCaseFeed(detail) {
  const seo = detail.seo || {}
  return {
    type: 'case',
    id: detail.id,
    slug: detail.slug || seo.slug || '',
    title: detail.title || '',
    serviceName: detail.serviceName || '',
    city: detail.city || '',
    aiSummary: detail.aiSummary || detail.summary || '',
    faultDesc: detail.faultDesc || '',
    inspectResult: detail.inspectResult || '',
    repairPlan: detail.repairPlan || '',
    keyInfo: (detail.keyInfo || []).map((item) => ({
      label: item.label || '',
      value: item.value || '',
    })),
    faq: (detail.faq || []).map((item) => ({
      q: item.q || item.question || '',
      a: item.a || item.answer || '',
    })),
    priceMode: detail.priceMode || '',
    minAmount: detail.minAmount ?? null,
    maxAmount: detail.maxAmount ?? null,
    planAmount: detail.planAmount ?? null,
    canonicalPath: seo.canonicalPath || detail.canonicalPath || '',
    updatedAt: detail.publishedAt || '',
    disclaimer: FEED_DISCLAIMER,
    complianceTail: STORE_CHECK_HINT,
    schemaGraph: detail.schemaGraph || null,
  }
}

function mapServiceFeed(payload) {
  const item = payload.item || {}
  const seo = payload.seo || {}
  return {
    type: 'service',
    slug: item.slug || '',
    name: item.name || '',
    cityFilter: item.cityFilter || '',
    aiSummary: item.aiSummary || item.summary || '',
    aggregateStats: payload.aggregateStats || null,
    schemaGraph: payload.schemaGraph || buildServicePageSchemaGraph({
      baseUrl: config.publicBaseUrl,
      item: payload.item,
      seo: payload.seo,
      geo: payload.geo,
      faq: payload.faq,
      aggregateStats: payload.aggregateStats,
      organizationSameAs: config.geo?.organizationSameAs || [],
    }),
    faq: (payload.faq || []).map((row) => ({
      q: row.q || row.question || '',
      a: row.a || row.answer || '',
    })),
    featuredCaseIds: (payload.featuredCases || []).map((row) => row.id).filter(Boolean),
    canonicalPath: seo.canonicalPath || `/service/${item.slug}.html`,
    updatedAt: (payload.geo && payload.geo.updatedAt) || '',
    disclaimer: FEED_DISCLAIMER,
    complianceTail: STORE_CHECK_HINT,
  }
}

async function getCaseFeedJson(caseIdOrSlug) {
  const detail = await getCaseDetail(caseIdOrSlug)
  if (!detail || !isIndexableSeo(detail.seo)) {
    const err = new Error('案例不存在或未开放收录')
    err.status = 404
    throw err
  }
  return mapCaseFeed(detail)
}

async function getServiceFeedJson(slug, query = {}) {
  const item = resolveH5ServiceItemBySlug(slug)
  if (!item) {
    const err = new Error('服务项目不存在或未开放')
    err.status = 404
    throw err
  }
  const payload = await getServiceItemPagePayload(slug, query)
  if (!isIndexableSeo(payload.seo)) {
    const err = new Error('服务页未开放收录')
    err.status = 404
    throw err
  }
  return mapServiceFeed(payload)
}

async function getFeedIndexJson() {
  const base = String(config.publicBaseUrl || '').replace(/\/$/, '')
  return {
    name: '辙见公开内容 Feed 索引',
    description: FEED_DISCLAIMER,
    feeds: {
      cases: `${base}/public/v1/cases/{slug}.json`,
      services: `${base}/public/v1/services/{slug}.json`,
      casesApi: `${base}/api/v1/public/v1/cases/{slug}.json`,
      servicesApi: `${base}/api/v1/public/v1/services/{slug}.json`,
      llmsTxt: `${base}/llms.txt`,
      sitemap: `${base}/sitemap.xml`,
    },
    llmsTxtPreview: (await getLlmsTxt()).split('\n').slice(0, 12).join('\n'),
  }
}

module.exports = {
  getCaseFeedJson,
  getServiceFeedJson,
  getFeedIndexJson,
  sendFeedJson,
  mapCaseFeed,
  mapServiceFeed,
}
