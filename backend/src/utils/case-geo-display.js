/**
 * 案例公开页展示层：去模板废话、节点合并、价格与摘要收敛
 */
const {
  defaultInspectResult,
  defaultRepairPlan,
  buildNodeDescription,
} = require('./case-article-templates')

const STAGE_GEO_FIELD = {
  stage_1: 'faultDesc',
  stage_2: 'inspectResult',
  stage_3: 'repairPlan',
  stage_6: 'resultConfirm',
}

const TITLE_GEO_RULES = [
  { keys: ['接车', '故障', '维修前', '损伤'], field: 'faultDesc' },
  { keys: ['检测', '诊断', '检查'], field: 'inspectResult' },
  { keys: ['方案', '报价'], field: 'repairPlan' },
  { keys: ['完工', '试车', '交付', '结果', '对比'], field: 'resultConfirm' },
]

function normalizeText(text) {
  return String(text || '').trim()
}

function polishCaseTitle(title) {
  return normalizeText(title).replace(/维修维修/gu, '维修')
}

function isGenericFaultDesc(text) {
  const v = normalizeText(text)
  return !v || v === '用户反馈的相关问题' || v === '到店进行相关检查'
}

function isGenericInspectResult(text) {
  const v = normalizeText(text)
  return !v || v === defaultInspectResult()
}

function isGenericRepairPlan(text, serviceName = '') {
  const v = normalizeText(text)
  if (!v) return true
  if (v === defaultRepairPlan(serviceName)) return true
  return /^根据检测结果，门店完成了.+的处理$/.test(v)
}

function isGenericGeoText(text, serviceName = '') {
  return (
    isGenericFaultDesc(text) ||
    isGenericInspectResult(text) ||
    isGenericRepairPlan(text, serviceName)
  )
}

function stripBoilerplateSummary(text) {
  return normalizeText(text)
    .replace(/^这是一个/u, '')
    .replace(/^该案例为/u, '')
    .replace(/^本案例为/u, '')
    .replace(/^.+?维修案例。/u, '')
    .replace(/车辆主要问题为用户反馈的相关问题。?/gu, '')
    .replace(/车辆主要问题为相关故障或养护需求。?/gu, '')
    .replace(/门店根据车辆实际情况进行了检查，?/gu, '')
    .replace(/门店根据检测结果，?/gu, '')
    .replace(/根据检测结果，门店完成了.+?的处理。?/gu, '')
    .replace(/图片已进行车牌、人脸、VIN、手机号等隐私脱敏，并通过平台审核。?/gu, '')
    .replace(/案例图片已进行车牌、人脸、VIN、手机号等隐私脱敏，并通过平台审核。?/gu, '')
    .replace(/该类服务价格会受到车型、配件品牌、损伤程度、工时和维修方案影响，?/gu, '')
    .replace(/页面展示价格仅供参考。?/gu, '')
    .replace(/实际费用以到店检测和方案确认为准。?/gu, '')
    .replace(/具体方案与费用以到店检测为准。?/gu, '')
    .replace(/维修维修/gu, '维修')
    .replace(/，+/g, '，')
    .replace(/^，+|，+$/g, '')
}

const TEMPLATE_SUMMARY_MARKERS = [
  '用户反馈的相关问题',
  '门店根据车辆实际情况进行了检查',
  '门店根据检测结果',
  '相关故障或养护需求',
  '该类服务价格会受到',
  '页面展示价格仅供参考',
  '图片已进行车牌、人脸',
]

function isTemplateBoilerplateSummary(text) {
  const v = normalizeText(text)
  if (!v) return true
  if (/^这是一个.+维修案例/.test(v)) return true
  if (/^.+维修案例。车辆主要问题为/.test(v)) return true
  if (v.includes('用户反馈的相关问题') && v.includes('门店根据车辆实际情况进行了检查')) {
    return true
  }
  const hits = TEMPLATE_SUMMARY_MARKERS.filter((marker) => v.includes(marker)).length
  return hits >= 2
}

function collectNodeSummaryFacts(item, nodes) {
  const facts = []
  ;(nodes || []).forEach((node) => {
    const note = normalizeText(node.note)
    if (!note || isGenericGeoText(note, item.serviceName)) return
    if (facts.includes(note)) return
    facts.push(note)
  })
  return facts
}

function buildDisplayAiSummary(item = {}) {
  if (Number(item.snapshotVersion) >= 1) {
    const raw = stripBoilerplateSummary(item.aiSummary || item.summary || '')
    if (raw && raw.length >= 8 && !isTemplateBoilerplateSummary(raw)) {
      return raw.length > 180 ? `${raw.slice(0, 179)}…` : raw
    }
    return ''
  }

  const serviceName = item.serviceName || '维修服务'
  const parts = []
  if (!isGenericFaultDesc(item.faultDesc)) parts.push(normalizeText(item.faultDesc))
  if (!isGenericInspectResult(item.inspectResult)) parts.push(normalizeText(item.inspectResult))
  if (!isGenericRepairPlan(item.repairPlan, serviceName)) {
    parts.push(normalizeText(item.repairPlan))
  }

  if (!parts.length) {
    parts.push(...collectNodeSummaryFacts(item, item.nodes))
  }

  const amount = item.amount ?? item.planAmount
  const isAuthorized =
    item.authorizationTier === 'anonymous' || item.authorizationTier === 'named'
  if (isAuthorized && amount != null && Number(amount) > 0) {
    parts.push(`当时方案参考费用约${Math.round(Number(amount))}元`)
  } else if (item.priceMode === 'range' && item.minAmount != null && item.maxAmount != null) {
    parts.push(`参考区间约${item.minAmount}-${item.maxAmount}元`)
  }

  if (parts.length) {
    let text = parts.join('。')
    if (!text.endsWith('。')) text += '。'
    return text.length > 180 ? `${text.slice(0, 179)}…` : text
  }

  const raw = stripBoilerplateSummary(item.aiSummary || item.summary || '')
  if (raw && raw.length >= 8 && !isTemplateBoilerplateSummary(raw) && !isTemplateBoilerplateSummary(item.aiSummary)) {
    return raw.length > 180 ? `${raw.slice(0, 179)}…` : raw
  }

  return ''
}

function resolveGeoFieldForNode(node, geo = {}, serviceName = '') {
  const id = normalizeText(node.id || node.nodeId)
  const fieldKey = STAGE_GEO_FIELD[id]
  if (fieldKey && geo[fieldKey] && !isGenericGeoText(geo[fieldKey], serviceName)) {
    return normalizeText(geo[fieldKey])
  }
  const title = normalizeText(node.title)
  for (const rule of TITLE_GEO_RULES) {
    if (rule.keys.some((key) => title.includes(key))) {
      const value = normalizeText(geo[rule.field])
      if (value && !isGenericGeoText(value, serviceName)) return value
    }
  }
  return ''
}

function buildNarrativeMap(nodeNarratives) {
  const map = {}
  ;(nodeNarratives || []).forEach((item) => {
    if (item && item.nodeId) map[item.nodeId] = item
  })
  return map
}

/**
 * @param {object[]} nodes
 * @param {object} geo faultDesc/inspectResult/repairPlan/resultConfirm/nodeNarratives
 * @param {string} [serviceName]
 */
function preparePublicCaseNodes(nodes, geo = {}, serviceName = '', options = {}) {
  const snapshotFrozen = Boolean(options.snapshotFrozen)
  const narrativeMap = buildNarrativeMap(geo.nodeNarratives)
  return (nodes || [])
    .map((node) => {
      const id = normalizeText(node.id || node.nodeId)
      const narrative = narrativeMap[id]
      let note = normalizeText(node.note)
      if (!note && narrative && narrative.description) {
        note = normalizeText(narrative.description)
      }
      if (!note && !snapshotFrozen) {
        note = resolveGeoFieldForNode(node, geo, serviceName)
      }
      if (!note && (node.images || []).length > 0) {
        const fallback = buildNodeDescription(node.title, '')
        note = isGenericGeoText(fallback, serviceName) ? '' : fallback
      }
      if (isGenericGeoText(note, serviceName)) note = ''

      const images = Array.isArray(node.images) ? node.images.filter(Boolean) : []
      return {
        id,
        title: normalizeText(node.title),
        note,
        images,
      }
    })
    .filter((node) => node.images.length > 0 || node.note)
}

function resolveAuthorizedFixedPrice(item = {}) {
  const isAuthorized =
    item.authorizationTier === 'anonymous' || item.authorizationTier === 'named'
  if (!isAuthorized) return null
  const amount = item.amount ?? item.planAmount
  if (amount == null || Number(amount) <= 0) return null
  return Math.round(Number(amount))
}

function applyCasePublicDisplay(item = {}) {
  if (!item || typeof item !== 'object') return item
  const serviceName = item.serviceName || ''
  const geo = {
    faultDesc: item.faultDesc,
    inspectResult: item.inspectResult,
    repairPlan: item.repairPlan,
    resultConfirm: item.resultConfirm,
    nodeNarratives:
      item.article?.nodeNarratives ||
      item.nodeNarratives ||
      (item.geo && item.geo.nodeNarratives) ||
      [],
  }
  const nodes = preparePublicCaseNodes(item.nodes, geo, serviceName, {
    snapshotFrozen: Number(item.snapshotVersion) >= 1,
  })
  const fixedAmount = resolveAuthorizedFixedPrice(item)
  const displayAiSummary = buildDisplayAiSummary({ ...item, nodes })

  const next = {
    ...item,
    title: polishCaseTitle(item.title),
    nodes,
    aiSummary: displayAiSummary || item.aiSummary || '',
    faultDesc: isGenericFaultDesc(item.faultDesc) ? '' : normalizeText(item.faultDesc),
    inspectResult: isGenericInspectResult(item.inspectResult) ? '' : normalizeText(item.inspectResult),
    repairPlan: isGenericRepairPlan(item.repairPlan, serviceName) ? '' : normalizeText(item.repairPlan),
    showNarrativeBlock: false,
  }

  if (fixedAmount != null) {
    next.priceMode = 'fixed'
    next.amount = fixedAmount
    next.planAmount = fixedAmount
    next.minAmount = null
    next.maxAmount = null
  }

  next.displayNodes = nodes
  next.displayAiSummary = displayAiSummary
  next.priceView = {
    priceMode: next.priceMode,
    amount: next.amount,
    minAmount: next.minAmount,
    maxAmount: next.maxAmount,
    sectionTitle: fixedAmount != null ? '方案报价' : next.priceMode === 'fixed' ? '方案报价' : '价格说明',
    showSuffix: fixedAmount != null ? false : next.priceMode === 'fixed',
    showDisclaimer: fixedAmount == null && next.priceMode !== 'fixed',
    disclaimerType: fixedAmount != null || next.priceMode === 'fixed' ? 'authorizedCaseFixed' : 'casePrice',
  }

  return next
}

module.exports = {
  isGenericFaultDesc,
  isGenericInspectResult,
  isGenericRepairPlan,
  isGenericGeoText,
  preparePublicCaseNodes,
  buildDisplayAiSummary,
  resolveAuthorizedFixedPrice,
  applyCasePublicDisplay,
}
