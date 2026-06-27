/**
 * 案例详情页展示预处理（小程序；与 backend case-geo-display 口径一致）
 */

function normalizeText(text) {
  return String(text || '').trim()
}

function polishCaseTitle(title) {
  return normalizeText(title).replace(/维修维修/gu, '维修')
}

const GENERIC_FAULT = new Set(['用户反馈的相关问题', '到店进行相关检查'])
const GENERIC_INSPECT = '门店根据车辆实际情况进行了检查'

function defaultRepairPlan(serviceName) {
  return `根据检测结果，门店完成了${serviceName || '相关维修'}的处理`
}

function isGenericFaultDesc(text) {
  const v = normalizeText(text)
  return !v || GENERIC_FAULT.has(v)
}

function isGenericInspectResult(text) {
  const v = normalizeText(text)
  return !v || v === GENERIC_INSPECT
}

function isGenericRepairPlan(text, serviceName) {
  const v = normalizeText(text)
  if (!v) return true
  return v === defaultRepairPlan(serviceName)
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
  if (/^这是一个.+维修案例/u.test(v)) return true
  if (/^.+维修案例。车辆主要问题为/u.test(v)) return true
  if (v.includes('用户反馈的相关问题') && v.includes('门店根据车辆实际情况进行了检查')) {
    return true
  }
  const hits = TEMPLATE_SUMMARY_MARKERS.filter((marker) => v.includes(marker)).length
  return hits >= 2
}

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

function resolveGeoFieldForNode(node, detail) {
  const serviceName = detail.serviceName || ''
  const id = normalizeText(node.id || node.nodeId)
  const fieldKey = STAGE_GEO_FIELD[id]
  if (fieldKey) {
    const value = normalizeText(detail[fieldKey])
    if (value && !isGenericFaultDesc(value) && !isGenericInspectResult(value) && !isGenericRepairPlan(value, serviceName)) {
      return value
    }
  }
  const title = normalizeText(node.title)
  for (const rule of TITLE_GEO_RULES) {
    if (rule.keys.some((key) => title.includes(key))) {
      const value = normalizeText(detail[rule.field])
      if (value && !isGenericFaultDesc(value) && !isGenericInspectResult(value) && !isGenericRepairPlan(value, serviceName)) {
        return value
      }
    }
  }
  return ''
}

function collectNodeSummaryFacts(detail) {
  const nodes = detail.displayNodes || detail.nodes || []
  const facts = []
  nodes.forEach((node) => {
    const note = normalizeText(node.note)
    if (!note) return
    if (isGenericFaultDesc(note) || isGenericInspectResult(note) || isGenericRepairPlan(note, detail.serviceName)) {
      return
    }
    if (facts.includes(note)) return
    facts.push(note)
  })
  return facts
}

function buildDisplayAiSummary(detail) {
  const parts = []
  if (!isGenericFaultDesc(detail.faultDesc)) parts.push(normalizeText(detail.faultDesc))
  if (!isGenericInspectResult(detail.inspectResult)) parts.push(normalizeText(detail.inspectResult))
  if (!isGenericRepairPlan(detail.repairPlan, detail.serviceName)) {
    parts.push(normalizeText(detail.repairPlan))
  }

  if (!parts.length) {
    parts.push(...collectNodeSummaryFacts(detail))
  }

  const isAuthorized =
    detail.authorizationTier === 'anonymous' || detail.authorizationTier === 'named'
  const amount = detail.amount ?? detail.planAmount
  if (isAuthorized && amount != null && Number(amount) > 0) {
    parts.push(`当时方案参考费用约${Math.round(Number(amount))}元`)
  }

  if (parts.length) {
    let text = parts.join('。')
    if (!text.endsWith('。')) text += '。'
    return text.length > 180 ? `${text.slice(0, 179)}…` : text
  }

  const raw = stripBoilerplateSummary(detail.aiSummary || detail.summary || '')
  if (raw && raw.length >= 8 && !isTemplateBoilerplateSummary(raw) && !isTemplateBoilerplateSummary(detail.aiSummary)) {
    return raw.length > 180 ? `${raw.slice(0, 179)}…` : raw
  }

  return ''
}

function prepareDisplayNodes(detail) {
  const narratives = detail.article?.nodeNarratives || detail.nodeNarratives || []
  const narrativeMap = {}
  narratives.forEach((item) => {
    if (item && item.nodeId) narrativeMap[item.nodeId] = item
  })

  return (detail.nodes || [])
    .map((node) => {
      const id = normalizeText(node.id || node.nodeId)
      const narrative = narrativeMap[id]
      let note = normalizeText(node.note)
      if (!note && narrative && narrative.description) note = normalizeText(narrative.description)
      if (!note) note = resolveGeoFieldForNode(node, detail)
      if (isGenericFaultDesc(note) || isGenericInspectResult(note) || isGenericRepairPlan(note, detail.serviceName)) {
        note = ''
      }
      const images = Array.isArray(node.images) ? node.images.filter(Boolean) : []
      return {
        ...node,
        id,
        title: normalizeText(node.title),
        note,
        images,
      }
    })
    .filter((node) => (node.images && node.images.length) || node.note)
}

function resolvePriceView(detail) {
  const isAuthorized =
    detail.authorizationTier === 'anonymous' || detail.authorizationTier === 'named'
  const amount = detail.amount ?? detail.planAmount
  if (isAuthorized && amount != null && Number(amount) > 0) {
    return {
      priceMode: 'fixed',
      amount: Math.round(Number(amount)),
      minAmount: null,
      maxAmount: null,
      sectionTitle: '方案报价',
      showSuffix: false,
      showDisclaimer: true,
      disclaimerType: 'authorizedCaseFixed',
    }
  }
  return {
    priceMode: detail.priceMode,
    amount: detail.amount,
    minAmount: detail.minAmount,
    maxAmount: detail.maxAmount,
    sectionTitle: detail.priceMode === 'fixed' ? '方案报价' : '价格说明',
    showSuffix: detail.priceMode === 'fixed',
    showDisclaimer: detail.priceMode !== 'fixed',
    disclaimerType: detail.priceMode === 'fixed' ? 'authorizedCaseFixed' : 'casePrice',
  }
}

function enrichCaseDetailForPage(detail) {
  if (!detail || typeof detail !== 'object') return detail
  const displayNodes = detail.displayNodes || prepareDisplayNodes(detail)
  const enriched = {
    ...detail,
    title: polishCaseTitle(detail.title),
    displayNodes,
    showNarrativeBlock: false,
  }
  enriched.displayAiSummary = buildDisplayAiSummary({ ...enriched, displayNodes })
  enriched.priceView = detail.priceView || resolvePriceView(enriched)
  return enriched
}

module.exports = {
  enrichCaseDetailForPage,
  prepareDisplayNodes,
  buildDisplayAiSummary,
  resolvePriceView,
  isTemplateBoilerplateSummary,
}
