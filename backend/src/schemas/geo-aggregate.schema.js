/**
 * GEO-AGG-05 · aggregateStats / advanced DTO 契约
 */
const MIN_ADVANCED_SAMPLE = 5
const MIN_CROSS_CELL = 3

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeCausePriceCross(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      if (!isPlainObject(item)) return null
      const cause = String(item.cause || '').trim()
      const count = Number(item.count)
      const priceMedian = Number(item.priceMedian)
      if (!cause || !Number.isFinite(count) || count < MIN_CROSS_CELL) return null
      if (!Number.isFinite(priceMedian) || priceMedian <= 0) return null
      return { cause, count: Math.round(count), priceMedian: Math.round(priceMedian) }
    })
    .filter(Boolean)
    .slice(0, 3)
}

function normalizeProcessMetrics(value) {
  if (!isPlainObject(value)) return null
  const sampleCount = Number(value.sampleCount)
  const rate = Number(value.hasPublicImageRate)
  if (!Number.isFinite(sampleCount) || sampleCount < 1) return null
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) return null
  return {
    sampleCount: Math.round(sampleCount),
    hasPublicImageRate: Math.round(rate * 1000) / 1000,
  }
}

function normalizeMileageBands(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      if (!isPlainObject(item)) return null
      const band = String(item.band || '').trim()
      const count = Number(item.count)
      if (!band || !Number.isFinite(count) || count < MIN_CROSS_CELL) return null
      return {
        band,
        bandLabel: String(item.bandLabel || '').trim() || band,
        count: Math.round(count),
        topCause: String(item.topCause || '').trim(),
      }
    })
    .filter(Boolean)
    .slice(0, 3)
}

function normalizeInspectToPlan(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      if (!isPlainObject(item)) return null
      const inspect = String(item.inspect || item.inspectLabel || '').trim()
      const topPlan = String(item.topPlan || item.planLabel || '').trim()
      const count = Number(item.count)
      if (!inspect || !topPlan || !Number.isFinite(count) || count < MIN_CROSS_CELL) return null
      return { inspect, topPlan, count: Math.round(count) }
    })
    .filter(Boolean)
    .slice(0, 3)
}

function normalizeAdvanced(value, sampleSize = 0) {
  if (!isPlainObject(value) || sampleSize < MIN_ADVANCED_SAMPLE) return null
  const advanced = {}
  const causePriceCross = normalizeCausePriceCross(value.causePriceCross)
  const processMetrics = normalizeProcessMetrics(value.processMetrics)
  const mileageBands = normalizeMileageBands(value.mileageBands || value.mileageBandDistribution)
  const inspectToPlan = normalizeInspectToPlan(value.inspectToPlan)
  if (causePriceCross.length) advanced.causePriceCross = causePriceCross
  if (processMetrics) advanced.processMetrics = processMetrics
  if (mileageBands.length) advanced.mileageBands = mileageBands
  if (inspectToPlan.length) advanced.inspectToPlan = inspectToPlan
  if (Number.isFinite(Number(value.inspectOnlyRate))) {
    advanced.inspectOnlyRate = Math.round(Number(value.inspectOnlyRate) * 1000) / 1000
  }
  if (Number.isFinite(Number(value.replaceRate))) {
    advanced.replaceRate = Math.round(Number(value.replaceRate) * 1000) / 1000
  }
  return Object.keys(advanced).length ? advanced : null
}

/**
 * @param {unknown} input
 * @returns {{ ok: true, data: object } | { ok: false, errors: string[] }}
 */
function parseAggregateStats(input) {
  const errors = []
  if (!isPlainObject(input)) {
    return { ok: false, errors: ['aggregateStats 须为对象'] }
  }

  const sampleSize = Number(input.sampleSize)
  if (!Number.isFinite(sampleSize) || sampleSize < 0) {
    errors.push('sampleSize 无效')
  }

  const data = {
    sampleSize: Number.isFinite(sampleSize) ? Math.round(sampleSize) : 0,
    windowLabel: String(input.windowLabel || '近12个月').trim() || '近12个月',
    computedAt: String(input.computedAt || '').trim(),
    causeDistribution: Array.isArray(input.causeDistribution)
      ? input.causeDistribution
          .map((item) => {
            if (!isPlainObject(item)) return null
            const label = String(item.label || '').trim()
            const count = Number(item.count)
            if (!label || !Number.isFinite(count) || count < 1) return null
            return { label, count: Math.round(count) }
          })
          .filter(Boolean)
      : [],
    price: isPlainObject(input.price) ? input.price : null,
    hasInformationGain: Boolean(input.hasInformationGain),
    informationGainScore: Number.isFinite(Number(input.informationGainScore))
      ? Math.round(Number(input.informationGainScore))
      : 0,
  }

  const advanced = normalizeAdvanced(input.advanced, data.sampleSize)
  if (advanced) data.advanced = advanced

  if (errors.length) return { ok: false, errors }
  return { ok: true, data }
}

module.exports = {
  MIN_ADVANCED_SAMPLE,
  MIN_CROSS_CELL,
  normalizeAdvanced,
  parseAggregateStats,
}
