/**
 * GEO-IGAIN-A01/A02 · 公开脱敏案例聚合统计（信息增量真源）
 */
const { STORE_CHECK_HINT } = require('../constants/geo-faq-templates')

const STATS_WINDOW_LABEL = '近12个月'
const PRICE_DISCLAIMER = '仅供参考'
const MIN_SAMPLE_FOR_PERCENT = 3
const MIN_SAMPLE_FOR_RATE_PERCENT = 10

const MILEAGE_BAND_LABELS = {
  low: '5万km以下',
  mid: '5–10万km',
  high: '10万km以上',
}

const CAUSE_RULES = [
  ['片厚不足或磨损接近极限', /片厚|磨损.*极限|刹车片.*薄|片材.*磨损/],
  ['刹车盘面积碳或拉痕', /盘.*碳|拉痕|盘面/],
  ['制冷剂不足或泄漏', /制冷剂|冷媒|漏|不制冷|压力不足/],
  ['火花塞或点火异常', /火花塞|点火|失火|点火线圈/],
  ['电瓶电量不足或老化', /电瓶|蓄电池|电压不足|启动困难/],
  ['机油老化或液位异常', /机油|润滑|油液/],
  ['密封件老化或渗漏', /密封|渗漏|漏油|漏水/],
  ['积碳或堵塞', /积碳|堵塞|脏污/],
]

const PLAN_RULES = [
  ['更换相关', /更换|换新|替换|总成/],
  ['调整或清洁', /调整|清洁|清洗|紧固|复位|加注|排气/],
  ['检测观察', /观察|复查|待查|继续观察/],
]

function parseMileageKm(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw)
  }
  const text = String(raw).trim().replace(/,/g, '')
  if (!text || text === '—') return null
  const wanMatch = text.match(/([\d.]+)\s*万/)
  if (wanMatch) {
    const km = Number(wanMatch[1]) * 10000
    return Number.isFinite(km) && km > 0 ? Math.round(km) : null
  }
  const numMatch = text.match(/([\d.]+)/)
  if (!numMatch) return null
  const num = Number(numMatch[1])
  return Number.isFinite(num) && num > 0 ? Math.round(num) : null
}

function resolveMileageBand(km) {
  if (km == null) return null
  if (km < 50000) return 'low'
  if (km <= 100000) return 'mid'
  return 'high'
}

function resolveCaseMileageKm(caseItem) {
  if (!caseItem) return null
  if (caseItem.mileageKm != null) {
    const km = Number(caseItem.mileageKm)
    if (Number.isFinite(km) && km > 0) return Math.round(km)
  }
  if (caseItem.vehicleMileage != null) {
    const km = parseMileageKm(caseItem.vehicleMileage)
    if (km != null) return km
  }
  const keyInfo = caseItem.keyInfo || []
  const row = keyInfo.find(
    (entry) => entry && (entry.label === '里程' || entry.label === '行驶里程')
  )
  if (row?.value) return parseMileageKm(row.value)
  return null
}

function normalizePlanLabel(repairPlan) {
  const text = String(repairPlan || '').trim()
  if (!text) return '方案待确认'
  for (const [label, pattern] of PLAN_RULES) {
    if (pattern.test(text)) return label
  }
  const compact = text.replace(/\s+/g, '').slice(0, 14)
  return compact || '方案待确认'
}

function filterIndexableCases(cases) {
  return (cases || []).filter((item) => {
    if (!item) return false
    if (item.seoNoindex) return false
    if (item.seo && item.seo.noindex) return false
    return true
  })
}

function normalizeCauseLabel(inspectResult) {
  const text = String(inspectResult || '').trim()
  if (!text) return '其他检查结论'
  for (const [label, pattern] of CAUSE_RULES) {
    if (pattern.test(text)) return label
  }
  const compact = text.replace(/\s+/g, '').slice(0, 14)
  return compact || '其他检查结论'
}

function resolveCaseAmount(caseItem) {
  if (caseItem.planAmount != null && Number.isFinite(Number(caseItem.planAmount))) {
    const value = Number(caseItem.planAmount)
    if (value > 0) return value
  }
  const min = caseItem.minAmount != null ? Number(caseItem.minAmount) : null
  const max = caseItem.maxAmount != null ? Number(caseItem.maxAmount) : null
  if (min != null && max != null && min > 0 && max > 0) {
    return (min + max) / 2
  }
  if (min != null && min > 0) return min
  if (max != null && max > 0) return max
  return null
}

function computePriceStats(cases, priceMode) {
  if (priceMode === 'accident' || priceMode === 'consult') return null
  const amounts = []
  ;(cases || []).forEach((item) => {
    const amount = resolveCaseAmount(item)
    if (amount != null && Number.isFinite(amount) && amount > 0) {
      amounts.push(amount)
    }
  })
  if (!amounts.length) return null
  const low = Math.min(...amounts)
  const high = Math.max(...amounts)
  const sorted = [...amounts].sort((a, b) => a - b)
  const mid = sorted[Math.floor(sorted.length / 2)]
  return {
    low: Math.round(low),
    high: Math.round(high),
    median: Math.round(mid),
    sampleSize: amounts.length,
    text:
      low === high
        ? `方案价参考约 ¥${Math.round(low)}（${PRICE_DISCLAIMER}）`
        : `方案价参考区间 ¥${Math.round(low)}–¥${Math.round(high)}（中位数 ¥${Math.round(mid)}，${PRICE_DISCLAIMER}）`,
  }
}

function computeCauseDistribution(cases) {
  const bucket = new Map()
  ;(cases || []).forEach((item) => {
    const label = normalizeCauseLabel(item.inspectResult)
    bucket.set(label, (bucket.get(label) || 0) + 1)
  })
  return [...bucket.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
}

function computeCausePriceCross(cases, sampleSize) {
  if (sampleSize < 5) return []
  const bucket = new Map()
  ;(cases || []).forEach((item) => {
    const label = normalizeCauseLabel(item.inspectResult)
    const amount = resolveCaseAmount(item)
    if (!bucket.has(label)) bucket.set(label, [])
    if (amount != null) bucket.get(label).push(amount)
  })
  return [...bucket.entries()]
    .map(([cause, amounts]) => {
      if (amounts.length < 3) return null
      const sorted = [...amounts].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      return { cause, count: amounts.length, priceMedian: Math.round(median) }
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
}

function computeProcessMetrics(cases) {
  const list = cases || []
  if (!list.length) return null
  const withImages = list.filter((item) => {
    const count = item.trustMeta?.publicImageCount
    if (count != null) return Number(count) > 0
    return false
  }).length
  return {
    hasPublicImageRate: withImages / list.length,
    sampleCount: list.length,
  }
}

function computeMileageBands(cases) {
  const bands = new Map()
  ;(cases || []).forEach((item) => {
    const km = resolveCaseMileageKm(item)
    const band = resolveMileageBand(km)
    if (!band) return
    if (!bands.has(band)) bands.set(band, [])
    bands.get(band).push(item)
  })
  if (!bands.size) return []

  return [...bands.entries()]
    .map(([band, items]) => {
      const causeBucket = new Map()
      items.forEach((caseItem) => {
        const cause = normalizeCauseLabel(caseItem.inspectResult)
        causeBucket.set(cause, (causeBucket.get(cause) || 0) + 1)
      })
      const topCause =
        [...causeBucket.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
      return {
        band,
        bandLabel: MILEAGE_BAND_LABELS[band],
        count: items.length,
        topCause: items.length >= MIN_SAMPLE_FOR_PERCENT ? topCause : '',
      }
    })
    .filter((item) => item.count >= MIN_SAMPLE_FOR_PERCENT)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
}

function computeInspectToPlanMetrics(cases, sampleSize) {
  const list = cases || []
  if (sampleSize < 5) return null

  const inspectBucket = new Map()
  list.forEach((item) => {
    const inspect = normalizeCauseLabel(item.inspectResult)
    const plan = normalizePlanLabel(item.repairPlan)
    if (!inspectBucket.has(inspect)) inspectBucket.set(inspect, new Map())
    const planMap = inspectBucket.get(inspect)
    planMap.set(plan, (planMap.get(plan) || 0) + 1)
  })

  const inspectToPlan = [...inspectBucket.entries()]
    .map(([inspect, planMap]) => {
      const ranked = [...planMap.entries()].sort((a, b) => b[1] - a[1])
      const [topPlan, count] = ranked[0] || []
      if (!topPlan || count < MIN_SAMPLE_FOR_PERCENT) return null
      return { inspect, topPlan, count }
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  const metrics = {}
  if (inspectToPlan.length) metrics.inspectToPlan = inspectToPlan

  if (sampleSize >= MIN_SAMPLE_FOR_RATE_PERCENT) {
    let inspectOnly = 0
    let replace = 0
    let known = 0
    list.forEach((item) => {
      const inspect = String(item.inspectResult || '')
      const plan = String(item.repairPlan || '')
      if (!inspect && !plan) return
      known += 1
      if (/更换|换新|替换/.test(`${inspect}${plan}`)) replace += 1
      if (
        /调整|清洁|清洗|紧固|复位|仅需/.test(`${inspect}${plan}`) &&
        !/更换|换新|替换/.test(plan)
      ) {
        inspectOnly += 1
      }
    })
    if (known >= MIN_SAMPLE_FOR_RATE_PERCENT) {
      metrics.inspectOnlyRate = Math.round((inspectOnly / known) * 1000) / 1000
      metrics.replaceRate = Math.round((replace / known) * 1000) / 1000
      metrics.rateSampleCount = known
    }
  }

  return Object.keys(metrics).length ? metrics : null
}

function computeAdvancedAggregate(cases, baseStats) {
  const sampleSize = baseStats.sampleSize || 0
  if (sampleSize < 5) return null

  const causePriceCross = computeCausePriceCross(cases, sampleSize)
  const processMetrics = computeProcessMetrics(cases)
  const mileageBands = computeMileageBands(cases)
  const inspectPlanMetrics = computeInspectToPlanMetrics(cases, sampleSize)

  const advanced = {}
  if (causePriceCross.length) advanced.causePriceCross = causePriceCross
  if (processMetrics) advanced.processMetrics = processMetrics
  if (mileageBands.length) advanced.mileageBands = mileageBands
  if (inspectPlanMetrics) {
    if (inspectPlanMetrics.inspectToPlan) {
      advanced.inspectToPlan = inspectPlanMetrics.inspectToPlan
    }
    if (inspectPlanMetrics.inspectOnlyRate != null) {
      advanced.inspectOnlyRate = inspectPlanMetrics.inspectOnlyRate
    }
    if (inspectPlanMetrics.replaceRate != null) {
      advanced.replaceRate = inspectPlanMetrics.replaceRate
    }
    if (inspectPlanMetrics.rateSampleCount != null) {
      advanced.rateSampleCount = inspectPlanMetrics.rateSampleCount
    }
  }
  return Object.keys(advanced).length ? advanced : null
}

function scoreInformationGainText(text) {
  const value = String(text || '').trim()
  if (!value) return 0
  let score = 0
  if (/\d+\s*例脱敏|收录\s*\d+\s*例|N\s*=\s*\d+/i.test(value)) score += 2
  if (/近\s*12\s*个月|近12个月/.test(value)) score += 1
  if (/常见检查结论|方案价参考|里程段|常见方案/.test(value)) score += 1
  return score
}

function formatAdvancedLine(advanced, sampleSize) {
  if (!advanced || sampleSize < 5) return ''
  const sentences = []
  const crossParts = (advanced.causePriceCross || []).map(
    (item) => `「${item.cause}」${item.count} 例（方案价中位 ¥${item.priceMedian}）`
  )
  if (crossParts.length) {
    sentences.push(`主因价区交叉：${crossParts.join('、')}`)
  }

  const topBand = (advanced.mileageBands || [])[0]
  if (topBand?.count >= MIN_SAMPLE_FOR_PERCENT) {
    const causeHint = topBand.topCause ? `，常见主因「${topBand.topCause}」` : ''
    sentences.push(`${topBand.bandLabel}里程段案例较多（${topBand.count} 例${causeHint}）`)
  }

  const topInspectPlan = (advanced.inspectToPlan || [])[0]
  if (topInspectPlan) {
    sentences.push(
      `「${topInspectPlan.inspect}」常见方案为${topInspectPlan.topPlan}（${topInspectPlan.count} 例，以到店检测为准）`
    )
  }

  if (!sentences.length) return ''
  return `${sentences.join('；')}。`
}

/**
 * @param {object[]} cases
 * @param {{ serviceName?: string, city?: string, priceMode?: string }} [options]
 */
function aggregatePublicCases(cases, options = {}) {
  const indexable = filterIndexableCases(cases)
  const sampleSize = indexable.length
  const causeDistribution = computeCauseDistribution(indexable)
  const price = computePriceStats(indexable, options.priceMode)
  const advanced = computeAdvancedAggregate(indexable, { sampleSize })

  const base = {
    sampleSize,
    windowLabel: STATS_WINDOW_LABEL,
    computedAt: new Date().toISOString(),
    causeDistribution,
    price,
    hasInformationGain: sampleSize > 0,
    informationGainScore: 0,
  }
  if (advanced) base.advanced = advanced

  const previewSummary = buildAggregateAiSummary({
    serviceName: options.serviceName || '维修服务',
    city: options.city || '',
    aggregateStats: base,
  })
  base.informationGainScore = scoreInformationGainText(previewSummary)
  if (sampleSize > 0 && base.informationGainScore < 2) {
    base.informationGainScore = sampleSize >= 3 ? 2 : 1
  }

  return base
}

function formatCauseLine(causeDistribution, sampleSize) {
  if (!causeDistribution.length || sampleSize < 1) return ''
  const parts = causeDistribution.map((item) => {
    if (sampleSize >= MIN_SAMPLE_FOR_PERCENT) {
      const pct = Math.round((item.count / sampleSize) * 100)
      return `${item.label}（${item.count} 例，约 ${pct}%）`
    }
    return `${item.label}（${item.count} 例）`
  })
  return `常见检查结论包括：${parts.join('、')}。`
}

/**
 * @param {{ serviceName: string, city?: string, aggregateStats: ReturnType<typeof aggregatePublicCases> }} input
 */
function buildAggregateAiSummary(input) {
  const serviceName = String(input.serviceName || '相关维修项目').trim()
  const city = String(input.city || '').trim()
  const stats = input.aggregateStats || {}
  const sampleSize = stats.sampleSize || 0
  if (sampleSize < 1) return ''

  const prefix = city ? `${city}${serviceName}` : serviceName
  const samplePart = `辙见平台${STATS_WINDOW_LABEL}收录 ${sampleSize} 例脱敏案例`
  const pricePart = stats.price?.text ? `；${stats.price.text}` : ''
  const causePart = formatCauseLine(stats.causeDistribution || [], sampleSize)
  const advancedPart = formatAdvancedLine(stats.advanced, sampleSize)
  const tail = `${STORE_CHECK_HINT}。`

  const body = [causePart, advancedPart].filter(Boolean).join('')
  return `${prefix}：${samplePart}${pricePart}。${body}${tail}`
}

function buildDerivedAggregateFaq(input) {
  const serviceName = String(input.serviceName || '相关维修项目').trim()
  const city = String(input.city || '').trim()
  const stats = input.aggregateStats || {}
  const sampleSize = stats.sampleSize || 0
  if (sampleSize < 1) return []

  const scope = city ? `${city}${serviceName}` : serviceName
  const causeLine = formatCauseLine(stats.causeDistribution || [], sampleSize)
  const answers = []

  if (causeLine) {
    answers.push({
      q: `${scope}常见原因有哪些？`,
      a: `根据辙见平台${STATS_WINDOW_LABEL}收录的 ${sampleSize} 例脱敏案例，${causeLine.replace(/^常见检查结论包括：/, '相关记录中较常见的检查结论包括：')}${STORE_CHECK_HINT}。`,
    })
  }

  if (stats.price && stats.price.low != null) {
    const priceText =
      stats.price.low === stats.price.high
        ? `约 ¥${stats.price.low}`
        : `约 ¥${stats.price.low}–¥${stats.price.high}（中位数 ¥${stats.price.median}）`
    answers.push({
      q: `${serviceName}参考价格大概多少？`,
      a: `根据上述 ${sampleSize} 例脱敏案例，方案价参考区间${priceText}（${PRICE_DISCLAIMER}）。实际车辆需到店检测后确认。${STORE_CHECK_HINT}。`,
    })
  }

  const topBand = stats.advanced?.mileageBands?.[0]
  if (topBand?.count >= MIN_SAMPLE_FOR_PERCENT) {
    answers.push({
      q: `${scope}常见里程段分布如何？`,
      a: `在上述 ${sampleSize} 例脱敏案例中，${topBand.bandLabel}里程段记录 ${topBand.count} 例${
        topBand.topCause ? `，较常见检查结论为「${topBand.topCause}」` : ''
      }。具体车辆需结合到店检测结果判断。${STORE_CHECK_HINT}。`,
    })
  }

  const topInspectPlan = stats.advanced?.inspectToPlan?.[0]
  if (topInspectPlan) {
    answers.push({
      q: `检查到「${topInspectPlan.inspect}」后通常如何处理？`,
      a: `根据上述案例记录，「${topInspectPlan.inspect}」较常见的方案方向为${topInspectPlan.topPlan}（${topInspectPlan.count} 例）。实际处理需以到店检测为准，不代表所有车辆都需相同方案。${STORE_CHECK_HINT}。`,
    })
  }

  return answers.slice(0, 3)
}

function mergeDerivedFaq(existingFaq, derivedFaq) {
  const existing = Array.isArray(existingFaq) ? existingFaq : []
  const derived = Array.isArray(derivedFaq) ? derivedFaq : []
  if (!derived.length) return existing
  const seen = new Set(
    existing.map((item) => String(item.q || item.question || '').trim()).filter(Boolean)
  )
  const prepend = derived.filter((item) => {
    const q = String(item.q || item.question || '').trim()
    return q && !seen.has(q)
  })
  return [...prepend, ...existing]
}

function applyAggregateToServiceContent({
  cases,
  serviceName,
  city,
  priceMode,
  aiSummary,
  faq,
}) {
  const aggregateStats = aggregatePublicCases(cases, { serviceName, city, priceMode })
  const enhancedAiSummary = buildAggregateAiSummary({
    serviceName,
    city,
    aggregateStats,
  })
  const derivedFaq = buildDerivedAggregateFaq({
    serviceName,
    city,
    aggregateStats,
  })

  return {
    aggregateStats,
    aiSummary: enhancedAiSummary || aiSummary || '',
    faq: mergeDerivedFaq(faq, derivedFaq),
  }
}

module.exports = {
  STATS_WINDOW_LABEL,
  MIN_SAMPLE_FOR_PERCENT,
  MIN_SAMPLE_FOR_RATE_PERCENT,
  MILEAGE_BAND_LABELS,
  filterIndexableCases,
  normalizeCauseLabel,
  normalizePlanLabel,
  parseMileageKm,
  resolveCaseMileageKm,
  resolveMileageBand,
  aggregatePublicCases,
  buildAggregateAiSummary,
  buildDerivedAggregateFaq,
  mergeDerivedFaq,
  applyAggregateToServiceContent,
  scoreInformationGainText,
  computeAdvancedAggregate,
  computeMileageBands,
  computeInspectToPlanMetrics,
}
