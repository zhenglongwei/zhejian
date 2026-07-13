/**
 * GEO-TOPIC-D01 / GEO-IGAIN-A04 / GEO-TOPIC-G01-G02
 * 从意图种子 + 服务库生成 geo_pages draft（摘要/FAQ 优先聚合统计，禁止无案例通用模板）
 */
const { resolveH5ServiceItemById } = require('../constants/h5-service-items')
const { getGeoFaqTemplate } = require('../constants/geo-faq-templates')
const { normalizeFaq, normalizeServiceMeta } = require('../schemas/geo-page.schema')
const {
  applyAggregateToServiceContent,
} = require('./geo-case-aggregate.service')
const { applyAggregateToVehicleTopicContent } = require('./geo-vehicle-topic.service')
const {
  filterCasesForGeoPage,
  buildPseudoPageFromSeed,
} = require('../utils/geo-topic-matcher')

const SERVICE_KEY_BY_ITEM_ID = {
  item_brake_pad: 'brake_pad',
  item_maintenance: 'maintenance',
  item_battery: 'battery',
  item_body_paint: 'body_paint',
  item_accident: 'accident',
}

function buildGeoPageId(slug) {
  const safe = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return safe ? `geop_${safe}` : ''
}

function resolveServiceKey(serviceItemId) {
  return SERVICE_KEY_BY_ITEM_ID[serviceItemId] || String(serviceItemId || '').trim()
}

function buildTitle(seed, serviceItem) {
  if (seed.title) return seed.title
  const serviceName = serviceItem?.name || seed.serviceName || '维修项目'
  const city = String(seed.city || '').trim()
  if (seed.pageType === 'city_service' && city) return `${city}${serviceName}参考`
  if (seed.pageType === 'city_fault' && city) {
    return `${city}${seed.faultTag || serviceName}怎么办`
  }
  return `${serviceName}常见问题`
}

function buildSummary(seed, serviceItem) {
  if (seed.summary) return seed.summary
  const serviceName = serviceItem?.name || seed.serviceName || '维修'
  const city = String(seed.city || '').trim()
  if (city) {
    return `汇总${city}本地${serviceName}相关说明、价格影响因素与脱敏案例，便于到店检测前了解参考信息。`
  }
  return `汇总${serviceName}相关常见问题、检查思路与费用影响因素，案例内容仅供参考。`
}

function buildTemplateFaq(seed, serviceItem) {
  if (Array.isArray(seed.faq) && seed.faq.length) return normalizeFaq(seed.faq)
  const serviceKey = resolveServiceKey(seed.serviceItemId)
  return getGeoFaqTemplate(seed.pageType, serviceKey, {
    city: seed.city,
    title: buildTitle(seed, serviceItem),
  })
}

/**
 * GEO-TOPIC-G01/G02 · 聚合统计驱动 aiSummary + 衍生 FAQ
 * @param {import('../constants/geo-topic-seed-list').GeoTopicSeed} seed
 * @param {object} serviceItem
 * @param {object[]} matchedCases
 */
function buildAggregateContent(seed, serviceItem, matchedCases) {
  const serviceName = serviceItem?.name || seed.serviceName || '相关维修项目'
  const city = String(seed.city || '').trim()
  const templateFaq = buildTemplateFaq(seed, serviceItem)

  if (seed.pageType === 'vehicle_service' && seed.vehicleSeries) {
    const aggregated = applyAggregateToVehicleTopicContent({
      cases: matchedCases,
      serviceName: serviceItem?.name || seed.serviceName || '相关维修项目',
      vehicleSeries: seed.vehicleSeries,
      city: seed.city,
      priceMode: serviceItem?.priceMode,
      aiSummary: seed.aiSummary || '',
      faq: templateFaq,
    })
    return {
      aiSummary: aggregated.aiSummary || seed.aiSummary || '',
      faq: aggregated.faq,
      aggregateStats: aggregated.aggregateStats,
    }
  }

  if (seed.aiSummary) {
    const aggregated = applyAggregateToServiceContent({
      cases: matchedCases,
      serviceName,
      city,
      priceMode: serviceItem?.priceMode,
      aiSummary: seed.aiSummary,
      faq: templateFaq,
    })
    return {
      aiSummary: seed.aiSummary,
      faq: aggregated.faq,
      aggregateStats: aggregated.aggregateStats,
    }
  }

  const aggregated = applyAggregateToServiceContent({
    cases: matchedCases,
    serviceName,
    city,
    priceMode: serviceItem?.priceMode,
    aiSummary: '',
    faq: templateFaq,
  })

  return {
    aiSummary: aggregated.aiSummary || '',
    faq: aggregated.faq,
    aggregateStats: aggregated.aggregateStats,
  }
}

function resolveMatchedCases(seed, serviceItem, options = {}) {
  const allCases = options.allCases || options.cases || []
  if (!allCases.length) return []
  const pseudoPage = buildPseudoPageFromSeed(seed, serviceItem)
  return filterCasesForGeoPage(pseudoPage, allCases, { serviceItem })
}

function buildSeoTitle(seed, serviceItem) {
  if (seed.seoTitle) return seed.seoTitle
  const title = buildTitle(seed, serviceItem)
  return `${title}_透明汽车维修平台 · 辙见`
}

function buildSeoDescription(seed, serviceItem, aiSummary) {
  if (seed.seoDescription) return seed.seoDescription
  const summary = String(aiSummary || buildSummary(seed, serviceItem)).trim()
  return summary.slice(0, 280)
}

/**
 * @param {import('../constants/geo-topic-seed-list').GeoTopicSeed} seed
 * @param {{ allCases?: object[], cases?: object[] }} [options]
 */
function generateGeoPageDraft(seed, options = {}) {
  if (!seed || !seed.slug) {
    const err = new Error('种子缺少 slug')
    err.status = 400
    throw err
  }

  const serviceItem = resolveH5ServiceItemById(seed.serviceItemId)
  if (!serviceItem) {
    const err = new Error(`未知 serviceItemId：${seed.serviceItemId}`)
    err.status = 400
    throw err
  }

  const title = buildTitle(seed, serviceItem)
  const summary = buildSummary(seed, serviceItem)
  const matchedCases = resolveMatchedCases(seed, serviceItem, options)
  const { aiSummary, faq } = buildAggregateContent(seed, serviceItem, matchedCases)
  const serviceMeta = normalizeServiceMeta({
    serviceItemId: serviceItem.serviceItemId,
    displayName: serviceItem.name,
    priceMode: serviceItem.priceMode,
    referencePriceHint: serviceItem.referencePriceHint,
    process: serviceItem.process,
    relatedSlugs: serviceItem.relatedSlugs,
  })

  return {
    id: buildGeoPageId(seed.slug),
    slug: seed.slug,
    title,
    summary,
    coverImage: seed.coverImage || '',
    pageType: seed.pageType,
    city: seed.city || '',
    serviceId: serviceItem.serviceItemId,
    faultTag: seed.faultTag || '',
    vehicleSeries: seed.vehicleSeries || '',
    keywords: seed.keywords || [serviceItem.name, ...(seed.city ? [seed.city] : [])],
    scenarios: seed.scenarios?.length ? seed.scenarios : serviceItem.scenarios || [],
    priceFactors: seed.priceFactors?.length ? seed.priceFactors : serviceItem.priceFactors || [],
    faq,
    faqLinks: seed.faqLinks || [],
    relatedCaseIds: seed.relatedCaseIds || [],
    relatedStoreIds: seed.relatedStoreIds || [],
    primaryStoreId: seed.primaryStoreId || '',
    relatedServiceId: serviceItem.serviceItemId,
    seoTitle: buildSeoTitle(seed, serviceItem),
    seoDescription: buildSeoDescription(seed, serviceItem, aiSummary),
    aiSummary,
    serviceMeta,
    promptId: seed.promptId || '',
  }
}

function generateGeoPageDrafts(seeds, options = {}) {
  return (seeds || []).map((seed) => generateGeoPageDraft(seed, options))
}

function generateVehicleSeriesDrafts(cases, options = {}) {
  const { discoverVehicleSeriesTopicSeeds } = require('./geo-vehicle-topic.service')
  return discoverVehicleSeriesTopicSeeds(cases, options).map((seed) =>
    generateGeoPageDraft(seed, { ...options, allCases: cases })
  )
}

module.exports = {
  buildGeoPageId,
  buildAggregateContent,
  resolveMatchedCases,
  generateGeoPageDraft,
  generateGeoPageDrafts,
  generateVehicleSeriesDrafts,
}
