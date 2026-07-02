/**
 * GEO-IGAIN-F / GEO-TOPIC-E · 车型车系轻量聚合与专题注入
 */
const crypto = require('crypto')
const {
  aggregatePublicCases,
  buildAggregateAiSummary,
  buildDerivedAggregateFaq,
  mergeDerivedFaq,
  STATS_WINDOW_LABEL,
} = require('./geo-case-aggregate.service')
const { GEO_PAGE_TYPE } = require('../constants/geo-page-status')
const { resolveH5ServiceItemById, H5_SERVICE_ITEMS } = require('../constants/h5-service-items')
const { matchServiceName } = require('../utils/service-case-link')

const MIN_VEHICLE_TOPIC_SAMPLE = 3

function normalizeSeriesLabel(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/系列|车系/g, '')
}

function parseVehicleSeriesFromCase(caseItem) {
  const text = String(caseItem?.vehicleText || '').trim()
  if (!text) return ''
  const parts = text.split(/[\s·,，/]+/).filter(Boolean)
  if (parts.length >= 2) return normalizeSeriesLabel(parts.join(''))
  const match = text.match(/([\u4e00-\u9fffA-Za-z0-9]+(?:\d+[\u4e00-\u9fffA-Za-z0-9]*))/g)
  if (match && match.length >= 2) return normalizeSeriesLabel(match[1])
  return normalizeSeriesLabel(text)
}

function seriesMatchesCase(caseItem, vehicleSeries) {
  const target = normalizeSeriesLabel(vehicleSeries)
  if (!target) return true
  const parsed = parseVehicleSeriesFromCase(caseItem)
  if (!parsed) return false
  return parsed.includes(target) || target.includes(parsed)
}

function filterCasesByVehicleSeries(cases, vehicleSeries) {
  return (cases || []).filter((item) => seriesMatchesCase(item, vehicleSeries))
}

function slugifyVehicleSeries(series) {
  const raw = String(series || '').trim()
  const ascii = raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  if (ascii.length >= 2) return ascii.slice(0, 32)
  return `v${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 8)}`
}

function buildVehicleTopicSlug(vehicleSeries, serviceSlug) {
  const safeService = String(serviceSlug || 'service').trim() || 'service'
  return `${safeService}-${slugifyVehicleSeries(vehicleSeries)}-cases`
}

function buildVehicleSeriesAiSummary(input) {
  const vehicleSeries = String(input.vehicleSeries || '').trim()
  const serviceName = String(input.serviceName || '相关维修项目').trim()
  const base = buildAggregateAiSummary({
    serviceName,
    city: input.city,
    aggregateStats: input.aggregateStats,
  })
  if (!base || !vehicleSeries) return base
  if (base.includes(vehicleSeries)) return base
  return base.replace(
    `${STATS_WINDOW_LABEL}收录`,
    `${vehicleSeries}${serviceName}${STATS_WINDOW_LABEL}收录`
  )
}

function applyAggregateToVehicleTopicContent({
  cases,
  serviceName,
  vehicleSeries,
  city,
  priceMode,
  aiSummary,
  faq,
}) {
  const matched = filterCasesByVehicleSeries(cases, vehicleSeries)
  const aggregateStats = aggregatePublicCases(matched, { serviceName, city, priceMode })
  const enhancedAiSummary =
    buildVehicleSeriesAiSummary({
      serviceName,
      vehicleSeries,
      city,
      aggregateStats,
    }) || aiSummary || ''

  const derivedFaq = buildDerivedAggregateFaq({
    serviceName: vehicleSeries ? `${vehicleSeries}${serviceName}` : serviceName,
    city,
    aggregateStats,
  })

  return {
    aggregateStats,
    matchedCaseCount: matched.length,
    aiSummary: enhancedAiSummary,
    faq: mergeDerivedFaq(faq, derivedFaq),
  }
}

/**
 * @param {object[]} cases
 * @param {{ minSample?: number }} [options]
 */
function discoverVehicleSeriesTopicSeeds(cases, options = {}) {
  const minSample = options.minSample != null ? options.minSample : MIN_VEHICLE_TOPIC_SAMPLE
  const buckets = new Map()

  ;(cases || []).forEach((caseItem) => {
    const series = parseVehicleSeriesFromCase(caseItem)
    if (!series) return
    const serviceItem =
      (caseItem.serviceItemId && resolveH5ServiceItemById(caseItem.serviceItemId)) ||
      H5_SERVICE_ITEMS.find((entry) => matchServiceName(caseItem.serviceName, entry.name))
    if (!serviceItem) return
    const key = `${serviceItem.serviceItemId}|${series}`
    const bucket = buckets.get(key) || {
      vehicleSeries: series,
      serviceItemId: serviceItem.serviceItemId,
      serviceSlug: serviceItem.slug,
      serviceName: serviceItem.name,
      caseIds: [],
    }
    if (caseItem.id && !bucket.caseIds.includes(caseItem.id)) {
      bucket.caseIds.push(caseItem.id)
    }
    buckets.set(key, bucket)
  })

  return [...buckets.values()]
    .filter((bucket) => bucket.caseIds.length >= minSample)
    .map((bucket) => ({
      slug: buildVehicleTopicSlug(bucket.vehicleSeries, bucket.serviceSlug),
      pageType: GEO_PAGE_TYPE.VEHICLE_SERVICE,
      title: `${bucket.vehicleSeries}${bucket.serviceName}案例参考`,
      serviceItemId: bucket.serviceItemId,
      vehicleSeries: bucket.vehicleSeries,
      relatedCaseIds: bucket.caseIds.slice(0, 12),
      keywords: [bucket.vehicleSeries, bucket.serviceName, '脱敏案例'],
    }))
}

module.exports = {
  MIN_VEHICLE_TOPIC_SAMPLE,
  parseVehicleSeriesFromCase,
  filterCasesByVehicleSeries,
  seriesMatchesCase,
  applyAggregateToVehicleTopicContent,
  discoverVehicleSeriesTopicSeeds,
  buildVehicleTopicSlug,
  slugifyVehicleSeries,
}
