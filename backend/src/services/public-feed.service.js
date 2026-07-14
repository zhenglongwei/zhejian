/**
 * GEO-IGAIN-B · 公开 JSON Feed（RAG 友好 · 与页面可见内容一致）
 */
const { config } = require('../config')
const { getCaseDetail, fetchPublicCaseRows, getMerchantDetail } = require('./content.service')
const { getServiceItemPagePayload } = require('./h5-service-item.service')
const { H5_SERVICE_ITEMS, resolveH5ServiceItemBySlug } = require('../constants/h5-service-items')
const { STORE_CHECK_HINT } = require('../constants/geo-faq-templates')
const { getLlmsTxt, getLlmsFullTxt } = require('./h5-discovery.service')
const { buildServicePageSchemaGraph, buildStorePageSchemaGraph } = require('../lib/schema-graph')
const { parseAggregateStats } = require('../schemas/geo-aggregate.schema')
const { listGeoPages } = require('./geo.service')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const { normalizeTransparencyPayload } = require('../schemas/store-transparency.schema')

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
  if (seo.noindex === true) return false
  const robots = String(seo.robots || '').toLowerCase().trim()
  if (!robots) return true
  if (robots.startsWith('noindex')) return false
  return robots.startsWith('index')
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
    trustMeta: detail.trustMeta || detail.enrichment?.trustMeta || null,
    schemaGraph: detail.schemaGraph || null,
  }
}

function mapServiceFeed(payload) {
  const item = payload.item || {}
  const seo = payload.seo || {}
  const parsedStats = parseAggregateStats(payload.aggregateStats || null)
  const aggregateStats = parsedStats.ok ? parsedStats.data : payload.aggregateStats || null
  return {
    type: 'service',
    slug: item.slug || '',
    name: item.name || '',
    cityFilter: item.cityFilter || '',
    aiSummary: item.aiSummary || item.summary || '',
    aggregateStats,
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

function mapStoreFeed(detail) {
  const seo = detail.seo || {}
  const transparency = normalizeTransparencyPayload(detail.transparency || {})
  return {
    type: 'store',
    id: detail.id,
    name: detail.name || '',
    city: detail.city || '',
    address: detail.address || '',
    phone: detail.phone || '',
    aiSummary: detail.aiSummary || detail.intro || '',
    casePreviews: Array.isArray(detail.casePreviews) ? detail.casePreviews : [],
    transparency,
    certifications: detail.certifications || [],
    certWall: (detail.certWall || []).map((row) => ({
      label: row.label || '',
      text: row.text || '',
      status: row.status || '',
      imageUrl: row.imageUrl || '',
    })),
    faq: (detail.faq || []).map((row) => ({
      q: row.q || row.question || '',
      a: row.a || row.answer || '',
    })),
    faqSource: detail.faqSource || '',
    schemaGraph:
      detail.schemaGraph ||
      buildStorePageSchemaGraph({
        baseUrl: config.publicBaseUrl,
        store: detail,
        transparency,
        faq: detail.faq,
        casePreviews: detail.casePreviews,
        organizationSameAs: config.geo?.organizationSameAs || [],
      }),
    canonicalPath: seo.canonicalPath || `/store/${detail.id}.html`,
    updatedAt: detail.updatedAt || transparency.asOfDate || '',
    disclaimer: FEED_DISCLAIMER,
    complianceTail: STORE_CHECK_HINT,
  }
}

async function getStoreFeedJson(storeId) {
  const detail = await getMerchantDetail(storeId)
  if (!detail || !isIndexableSeo(detail.seo)) {
    const err = new Error('门店不存在或未开放收录')
    err.status = 404
    throw err
  }
  return mapStoreFeed(detail)
}

async function getFeedIndexJson() {
  const base = String(config.publicBaseUrl || '').replace(/\/$/, '')
  const [geoPages, cases] = await Promise.all([
    listGeoPages({ status: GEO_PAGE_STATUS.PUBLISHED, limit: 500 }),
    fetchPublicCaseRows(),
  ])
  const topicCount = (geoPages.list || []).filter(
    (page) => page.pageType && page.pageType !== 'service_base'
  ).length

  return {
    name: '辙见公开内容 Feed 索引',
    description: FEED_DISCLAIMER,
    stats: {
      serviceCount: H5_SERVICE_ITEMS.length,
      topicCount,
      caseCount: cases.length,
      statsWindow: '近12个月',
    },
    fieldContract: {
      trustMeta: '案例授权档、快照版本、证据等级、脱敏标记',
      transparency:
        '公开：案例/过程资料齐全度/服务/资质 dimensions；无案例不出分；咨询响应仅后台',
      aggregateStats: 'sampleSize、causeDistribution、price、computedAt',
      advanced: 'N≥5 时含 causePriceCross、processMetrics',
      complianceTail: STORE_CHECK_HINT,
    },
    feeds: {
      cases: `${base}/public/v1/cases/{slug}.json`,
      services: `${base}/public/v1/services/{slug}.json`,
      stores: `${base}/public/v1/stores/{storeId}.json`,
      casesApi: `${base}/api/v1/public/v1/cases/{slug}.json`,
      servicesApi: `${base}/api/v1/public/v1/services/{slug}.json`,
      storesApi: `${base}/api/v1/public/v1/stores/{storeId}.json`,
      llmsTxt: `${base}/llms.txt`,
      llmsFullTxt: `${base}/llms-full.txt`,
      sitemap: `${base}/sitemap.xml`,
      topicsRss: `${base}/feeds/topics.xml`,
    },
    llmsTxtPreview: (await getLlmsTxt()).split('\n').slice(0, 12).join('\n'),
  }
}

module.exports = {
  getCaseFeedJson,
  getServiceFeedJson,
  getStoreFeedJson,
  getFeedIndexJson,
  sendFeedJson,
  mapCaseFeed,
  mapServiceFeed,
  mapStoreFeed,
}
