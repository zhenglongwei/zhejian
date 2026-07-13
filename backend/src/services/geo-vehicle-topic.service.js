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
const { scoreInformationGainText } = require('./geo-case-aggregate.service')
const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')

const MIN_VEHICLE_TOPIC_SAMPLE = 3
const VEHICLE_TOPIC_STATS_SAMPLE = 5
const INFORMATION_GAIN_PATTERN = /\d+\s*例脱敏|收录\s*\d+\s*例|N\s*=\s*\d+/i

function hasInformationGainSummary(text) {
  const value = String(text || '').trim()
  if (!value) return false
  return scoreInformationGainText(value) >= 2 || INFORMATION_GAIN_PATTERN.test(value)
}

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

function buildVehicleTopicPromptId(slug) {
  const safe = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return safe ? `prompt_vehicle_${safe}` : 'prompt_vehicle_unknown'
}

function buildVehicleTopicPromptText(input = {}) {
  const vehicleSeries = String(input.vehicleSeries || '').trim()
  const serviceName = String(input.serviceName || '维修').trim()
  if (vehicleSeries) {
    return `${vehicleSeries}${serviceName}维修案例参考，费用大概多少？`
  }
  return `${serviceName}车型维修案例参考，有没有类似费用？`
}

function buildVehicleTopicPromptSeed(page = {}) {
  const slug = String(page.slug || '').trim()
  const vehicleSeries = String(page.vehicleSeries || '').trim()
  const serviceName =
    page.serviceMeta?.displayName || page.serviceName || page.title || '维修'
  return {
    promptId: buildVehicleTopicPromptId(slug),
    prompt: buildVehicleTopicPromptText({ vehicleSeries, serviceName }),
    city: page.city || '',
    service: serviceName,
    fault: '',
    topicSlug: slug,
    pageType: GEO_PAGE_TYPE.VEHICLE_SERVICE,
    promptType: 'C',
    source: 'vehicle_topic',
    active: true,
  }
}

function resolveVehicleTopicMatchedCases(page, cases = []) {
  const vehicleSeries = String(page.vehicleSeries || '').trim()
  if (!vehicleSeries) return []

  const manualIds = Array.isArray(page.relatedCaseIds) ? page.relatedCaseIds : []
  let matched = filterCasesByVehicleSeries(cases, vehicleSeries)

  const serviceItemId =
    page.serviceId || page.relatedServiceId || page.serviceMeta?.serviceItemId || ''
  if (serviceItemId) {
    const serviceItem = resolveH5ServiceItemById(serviceItemId)
    matched = matched.filter((caseItem) => {
      if (caseItem.serviceItemId === serviceItemId) return true
      if (serviceItem && matchServiceName(caseItem.serviceName, serviceItem.name)) return true
      return false
    })
  }

  if (manualIds.length) {
    const manual = matched.filter((caseItem) => manualIds.includes(caseItem.id))
    if (manual.length) return manual
  }
  return matched
}

function validateVehicleTopicPublishGate(page, cases = []) {
  const vehicleSeries = String(page.vehicleSeries || '').trim()
  if (!vehicleSeries) {
    const err = new Error('车型专题发布须填写车系（vehicleSeries）')
    err.status = 400
    throw err
  }

  const matched = resolveVehicleTopicMatchedCases(page, cases)
  const caseCount = matched.length

  if (caseCount < MIN_VEHICLE_TOPIC_SAMPLE) {
    const err = new Error(
      `车型专题发布需同车系案例 ≥${MIN_VEHICLE_TOPIC_SAMPLE} 例，当前 ${caseCount} 例；请补充案例或保持草稿/noindex`
    )
    err.status = 400
    throw err
  }

  if (caseCount >= VEHICLE_TOPIC_STATS_SAMPLE) {
    const aiSummary = String(page.aiSummary || '').trim()
    if (!hasInformationGainSummary(aiSummary)) {
      const err = new Error(
        `案例 ≥${VEHICLE_TOPIC_STATS_SAMPLE} 例时，摘要须含 N= 统计句后再发布`
      )
      err.status = 400
      throw err
    }
  }

  return {
    vehicleSeries,
    caseCount,
    minSample: MIN_VEHICLE_TOPIC_SAMPLE,
    statsSample: VEHICLE_TOPIC_STATS_SAMPLE,
    passed: true,
  }
}

async function ensureVehicleTopicPromptBinding(page) {
  const seed = buildVehicleTopicPromptSeed(page)
  const existing = await prisma.geoPromptProbe.findUnique({
    where: { promptId: seed.promptId },
  })
  const data = {
    prompt: seed.prompt,
    city: seed.city,
    service: seed.service,
    fault: seed.fault,
    topicSlug: seed.topicSlug,
    pageType: seed.pageType,
    promptType: seed.promptType,
    source: seed.source,
    active: true,
  }
  if (existing) {
    await prisma.geoPromptProbe.update({ where: { id: existing.id }, data })
    return { ...seed, action: 'updated' }
  }
  await prisma.geoPromptProbe.create({
    data: { id: newId('gpp'), promptId: seed.promptId, ...data },
  })
  return { ...seed, action: 'created' }
}

function assessVehicleTopicPublishReadiness(page, cases = []) {
  const matched = resolveVehicleTopicMatchedCases(page, cases)
  const caseCount = matched.length
  const gate = {
    caseCount,
    minSample: MIN_VEHICLE_TOPIC_SAMPLE,
    canPublish: caseCount >= MIN_VEHICLE_TOPIC_SAMPLE,
    needsStatsSummary:
      caseCount >= VEHICLE_TOPIC_STATS_SAMPLE &&
      !hasInformationGainSummary(page.aiSummary || ''),
  }
  if (!page.vehicleSeries) {
    gate.canPublish = false
    gate.note = '须填写车系'
  } else if (!gate.canPublish) {
    gate.note = `样本不足，需 ≥${MIN_VEHICLE_TOPIC_SAMPLE} 例同车系案例`
  } else if (gate.needsStatsSummary) {
    gate.note = `可发布，但案例 ≥${VEHICLE_TOPIC_STATS_SAMPLE} 例时建议摘要含 N= 统计句`
  } else {
    gate.note = '满足发布样本门槛，可人工审核发布'
  }
  return gate
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
      serviceName: bucket.serviceName,
      vehicleSeries: bucket.vehicleSeries,
      promptId: buildVehicleTopicPromptId(
        buildVehicleTopicSlug(bucket.vehicleSeries, bucket.serviceSlug)
      ),
      promptText: buildVehicleTopicPromptText({
        vehicleSeries: bucket.vehicleSeries,
        serviceName: bucket.serviceName,
      }),
      promptType: 'C',
      relatedCaseIds: bucket.caseIds.slice(0, 12),
      keywords: [bucket.vehicleSeries, bucket.serviceName, '脱敏案例'],
    }))
}

module.exports = {
  MIN_VEHICLE_TOPIC_SAMPLE,
  VEHICLE_TOPIC_STATS_SAMPLE,
  parseVehicleSeriesFromCase,
  filterCasesByVehicleSeries,
  seriesMatchesCase,
  applyAggregateToVehicleTopicContent,
  discoverVehicleSeriesTopicSeeds,
  buildVehicleTopicSlug,
  slugifyVehicleSeries,
  buildVehicleTopicPromptId,
  buildVehicleTopicPromptText,
  buildVehicleTopicPromptSeed,
  resolveVehicleTopicMatchedCases,
  validateVehicleTopicPublishGate,
  ensureVehicleTopicPromptBinding,
  assessVehicleTopicPublishReadiness,
}
