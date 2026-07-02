/**
 * GEO-IGAIN-A01/A02 · 公开脱敏案例聚合统计（信息增量真源）
 */
const { STORE_CHECK_HINT } = require('../constants/geo-faq-templates')

const STATS_WINDOW_LABEL = '近12个月'
const PRICE_DISCLAIMER = '仅供参考'
const MIN_SAMPLE_FOR_PERCENT = 3

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

/**
 * @param {object[]} cases
 * @param {{ serviceName?: string, city?: string, priceMode?: string }} [options]
 */
function aggregatePublicCases(cases, options = {}) {
  const indexable = filterIndexableCases(cases)
  const sampleSize = indexable.length
  const causeDistribution = computeCauseDistribution(indexable)
  const price = computePriceStats(indexable, options.priceMode)

  return {
    sampleSize,
    windowLabel: STATS_WINDOW_LABEL,
    causeDistribution,
    price,
    hasInformationGain: sampleSize > 0,
    informationGainScore: sampleSize > 0 ? (sampleSize >= 3 ? 2 : 1) : 0,
  }
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
  const tail = `${STORE_CHECK_HINT}。`

  return `${prefix}：${samplePart}${pricePart}。${causePart}${tail}`
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

  return answers.slice(0, 2)
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
  filterIndexableCases,
  normalizeCauseLabel,
  aggregatePublicCases,
  buildAggregateAiSummary,
  buildDerivedAggregateFaq,
  mergeDerivedFaq,
  applyAggregateToServiceContent,
}
