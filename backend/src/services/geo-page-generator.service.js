/**
 * GEO-TOPIC-D01 · 从意图种子 + 服务库生成 geo_pages draft
 */
const { resolveH5ServiceItemById } = require('../constants/h5-service-items')
const { getGeoFaqTemplate, STORE_CHECK_HINT } = require('../constants/geo-faq-templates')
const { normalizeFaq, normalizeServiceMeta } = require('../schemas/geo-page.schema')

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

function buildAiSummary(seed, serviceItem) {
  if (seed.aiSummary) return seed.aiSummary
  const serviceName = serviceItem?.name || seed.serviceName || '相关维修项目'
  const city = String(seed.city || '').trim()

  if (seed.pageType === 'city_service' && city) {
    return `${city}${serviceName}常见咨询汇总：适用情况、参考价格影响因素与脱敏案例说明。${STORE_CHECK_HINT}。`
  }
  if (seed.pageType === 'city_fault' && city) {
    const fault = seed.faultTag || seed.title || '相关故障'
    return `${city}地区「${fault}」常见检查思路与可咨询门店说明，案例仅作过程参考。${STORE_CHECK_HINT}。`
  }
  if (seed.pageType === 'fault_qa') {
    return `关于「${seed.title || serviceName}」的常见原因、检查建议与维修前准备说明。${STORE_CHECK_HINT}。`
  }
  if (seed.pageType === 'vehicle_service' && seed.vehicleSeries) {
    if (seed.aiSummary) return seed.aiSummary
    return `${seed.vehicleSeries}${serviceName}相关脱敏案例参考：常见检查结论与费用影响因素说明。${STORE_CHECK_HINT}。`
  }
  return `${serviceName}相关维修说明与参考信息，实际方案与费用以到店检测为准。`
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

function buildSeoTitle(seed, serviceItem) {
  if (seed.seoTitle) return seed.seoTitle
  const title = buildTitle(seed, serviceItem)
  return `${title}_透明汽车维修平台 · 辙见`
}

function buildSeoDescription(seed, serviceItem) {
  if (seed.seoDescription) return seed.seoDescription
  return buildAiSummary(seed, serviceItem).slice(0, 280)
}

function buildFaq(seed, serviceItem) {
  if (Array.isArray(seed.faq) && seed.faq.length) return normalizeFaq(seed.faq)
  const serviceKey = resolveServiceKey(seed.serviceItemId)
  return getGeoFaqTemplate(seed.pageType, serviceKey, {
    city: seed.city,
    title: buildTitle(seed, serviceItem),
  })
}

/**
 * @param {import('../constants/geo-topic-seed-list').GeoTopicSeed} seed
 */
function generateGeoPageDraft(seed) {
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
  const aiSummary = buildAiSummary(seed, serviceItem)
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
    faq: buildFaq(seed, serviceItem),
    faqLinks: seed.faqLinks || [],
    relatedCaseIds: seed.relatedCaseIds || [],
    relatedStoreIds: seed.relatedStoreIds || [],
    primaryStoreId: seed.primaryStoreId || '',
    relatedServiceId: serviceItem.serviceItemId,
    seoTitle: buildSeoTitle(seed, serviceItem),
    seoDescription: buildSeoDescription(seed, serviceItem),
    aiSummary,
    serviceMeta,
    promptId: seed.promptId || '',
  }
}

function generateGeoPageDrafts(seeds) {
  return (seeds || []).map(generateGeoPageDraft)
}

function generateVehicleSeriesDrafts(cases, options = {}) {
  const { discoverVehicleSeriesTopicSeeds } = require('./geo-vehicle-topic.service')
  return discoverVehicleSeriesTopicSeeds(cases, options).map(generateGeoPageDraft)
}

module.exports = {
  buildGeoPageId,
  generateGeoPageDraft,
  generateGeoPageDrafts,
  generateVehicleSeriesDrafts,
}
