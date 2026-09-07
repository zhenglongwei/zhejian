/**
 * DOC-FLOW · 单据规则生成（无 LLM）
 * 真源：docs/04_维修过程相册/26_商家端事件节点与单据节点链流程.md §4
 */
const {
  INSPECTION_DISCLAIMER,
  FINDING_RESULT,
  FINDING_RESULT_OPTIONS,
  FINDING_ADVICE_NONE,
  isValidFindingResult,
  findingAdviceRequired,
} = require('../constants/service-flow-nodes')

function mapPhotoRows(images = []) {
  return (images || [])
    .map((img) => {
      const url = typeof img === 'string' ? img : img.url || ''
      if (!url) return null
      const caption = String((typeof img === 'object' && img.caption) || '').trim()
      return {
        imageId: (typeof img === 'object' && img.id) || '',
        url,
        caption,
        captionEmpty: !caption,
      }
    })
    .filter(Boolean)
}

function normalizeFindingResult(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  if (isValidFindingResult(text)) return text
  if (/良好|正常/.test(text)) return FINDING_RESULT.OK
  if (/关注/.test(text)) return FINDING_RESULT.WATCH
  if (/处理|维修|更换|立即/.test(text)) return FINDING_RESULT.ACTION
  return text
}

function normalizeFinding(raw = {}) {
  const caption = String(raw.caption || '').trim()
  const result = normalizeFindingResult(raw.result)
  let advice = String(raw.advice || '').trim()
  if (result === FINDING_RESULT.OK && !advice) {
    advice = FINDING_ADVICE_NONE
  }
  return {
    imageId: String(raw.imageId || raw.id || ''),
    url: String(raw.url || ''),
    caption,
    captionEmpty: !caption,
    partName: String(raw.partName || caption || '').trim(),
    // 存量字段保留读取，新录入不再要求
    symptom: String(raw.symptom || '').trim(),
    result,
    advice,
  }
}

/** 检测发现项：优先用过程步 photoDraft / 结构化字段，否则用图注作部位 */
function mapFindingRows(images = [], draftFindings = []) {
  const draftByKey = {}
  ;(draftFindings || []).forEach((raw, index) => {
    const item = normalizeFinding(raw)
    const key = item.imageId || item.url
    if (key) draftByKey[key] = item
    draftByKey[`#${index}`] = item
  })
  return mapPhotoRows(images).map((row, index) => {
    const draft = draftByKey[row.imageId] || draftByKey[row.url] || draftByKey[`#${index}`] || {}
    return normalizeFinding({
      ...row,
      ...draft,
      url: row.url,
      imageId: row.imageId || draft.imageId || '',
      caption: row.caption || draft.caption || '',
      partName: draft.partName || row.caption || '',
    })
  })
}

function collectInspectionReportGaps(payload = {}) {
  const gaps = []
  if (!String(payload.chiefComplaint || '').trim()) {
    gaps.push('请填写进店主诉')
  }
  const findings = Array.isArray(payload.findings) ? payload.findings : []
  if (!findings.length) {
    gaps.push('请至少上传 1 张检测照片并填写发现项')
    return gaps
  }
  findings.forEach((raw, index) => {
    const item = normalizeFinding(raw)
    const label = item.partName || `第 ${index + 1} 项`
    if (!item.partName) gaps.push(`「${label}」请填写检查部位`)
    if (!item.result || !isValidFindingResult(item.result)) {
      gaps.push(`「${label}」请选择检查结果`)
    } else if (findingAdviceRequired(item.result) && !item.advice) {
      gaps.push(`「${label}」请填写处理建议`)
    }
  })
  return gaps
}

function collectDeliveryPhotoDraftGaps(payload = {}) {
  const gaps = []
  if (!String(payload.warrantyPeriod || '').trim()) {
    gaps.push('请填写质保期限')
  }
  if (!String(payload.warrantyScope || '').trim()) {
    gaps.push('请填写质保范围')
  }
  return gaps
}

function buildInspectionReportPayload({
  vehicle = {},
  albumNodes = [],
  chiefComplaint = '',
  findings: findingsInput,
  conclusion = '',
  photoDraft = {},
} = {}) {
  const intake = (albumNodes || []).find((n) => n.id === 'stage_1')
  const inspection = (albumNodes || []).find((n) => n.id === 'stage_2')
  // 统一入口：发现项来自 stage_2；存量 stage_1 并入
  const mergedImages = []
    .concat((intake && intake.images) || [])
    .concat((inspection && inspection.images) || [])
  const draftFindings =
    Array.isArray(findingsInput) && findingsInput.length
      ? findingsInput
      : Array.isArray(photoDraft.findings)
        ? photoDraft.findings
        : []
  const findings = mapFindingRows(mergedImages, draftFindings)
  const mileageFromFinding = findings.find((item) => {
    const text = [item.partName, item.result, item.advice, item.caption].join(' ')
    return /\d/.test(text)
  })
  return {
    vehicleBrand: String(vehicle.brand || ''),
    vehicleSeries: String(vehicle.series || ''),
    vehicleYear: String(vehicle.modelYear || vehicle.year || ''),
    mileageText:
      String(vehicle.mileage || vehicle.mileageKm || '').trim() ||
      (mileageFromFinding
        ? mileageFromFinding.partName || mileageFromFinding.caption || ''
        : ''),
    chiefComplaint: String(
      chiefComplaint || photoDraft.chiefComplaint || '',
    ).trim(),
    reportDate: new Date().toISOString().slice(0, 10),
    findings,
    disclaimer: INSPECTION_DISCLAIMER,
    conclusion: String(conclusion || photoDraft.conclusion || '').trim(),
  }
}

function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** 存量行：name=部位·建议、note=结果 → name=部位·结果、note=建议 */
function remapLegacyQuoteLineLayout(line = {}) {
  const note = String(line.note || '').trim()
  const name = String(line.name || '').trim()
  if (!isValidFindingResult(note) || !name.includes(' · ')) return line
  const sep = name.indexOf(' · ')
  const part = name.slice(0, sep).trim()
  const advice = name.slice(sep + 3).trim()
  if (!part || !advice) return line
  return {
    ...line,
    name: `${part} · ${note}`,
    note: advice,
  }
}

function normalizeQuoteLine(raw = {}) {
  const amount = parseAmount(raw.amount != null ? raw.amount : raw.priceHint)
  return remapLegacyQuoteLineLayout({
    name: String(raw.name || '').trim(),
    amount: amount == null ? '' : amount,
    note: String(raw.note || '').trim(),
    evidenceUrl: String(raw.evidenceUrl || raw.url || '').trim(),
  })
}

function collectQuoteConfirmGaps(payload = {}) {
  const gaps = []
  const lines = Array.isArray(payload.lines) ? payload.lines.map(normalizeQuoteLine) : []
  const valid = lines.filter((l) => l.name)
  if (!valid.length) {
    gaps.push('请至少填写一行方案项目')
    return gaps
  }
  valid.forEach((line, index) => {
    const label = line.name || `第 ${index + 1} 行`
    if (line.amount === '' || line.amount == null || Number(line.amount) < 0) {
      gaps.push(`「${label}」请填写金额`)
    }
  })
  return gaps
}

function sumQuoteAmounts(lines = []) {
  return (lines || []).reduce((sum, raw) => {
    const line = normalizeQuoteLine(raw)
    const n = Number(line.amount)
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
}

function buildWorkOrderPayloadFromQuote(quotePayload = {}, sourceQuoteNodeId = '') {
  const lines = Array.isArray(quotePayload.lines) ? quotePayload.lines : []
  return {
    sourceQuoteNodeId,
    items: lines
      .map((line) => normalizeQuoteLine(line))
      .filter((line) => line.name)
      .map((line) => ({
        name: line.name,
        amount: line.amount === '' ? 0 : Number(line.amount),
        note: line.note,
      })),
  }
}

/** 方案草稿：从「需关注/需处理」发现项预填（金额手填）
 * name = 部位 · 检测结果；note = 处理建议（可长文）
 */
function buildQuoteLinesFromFindings(findings = []) {
  return (findings || [])
    .map((raw) => {
      const item = normalizeFinding(raw)
      if (!findingAdviceRequired(item.result)) return null
      if (!item.advice || item.advice === FINDING_ADVICE_NONE) return null
      const name =
        [item.partName, item.result].filter(Boolean).join(' · ') ||
        item.partName ||
        item.result
      return {
        name,
        amount: '',
        note: item.advice || '',
        evidenceUrl: item.url || '',
      }
    })
    .filter(Boolean)
}

function buildRepairReportPayload({
  chiefComplaint = '',
  workItems = [],
  deliveryImages = [],
  warranty = {},
  photoDraft = {},
  confirmCopy = '',
  totalAmount = null,
} = {}) {
  const period =
    String(warranty.period || photoDraft.warrantyPeriod || '').trim() || '以门店公示为准'
  const scope =
    String(warranty.scope || photoDraft.warrantyScope || '').trim() || '本次已确认施工项目'
  const exclusions =
    String(warranty.exclusions || photoDraft.warrantyExclusions || '').trim() ||
    '外力撞击、涉水、未按约定使用等除外'
  const items = (workItems || []).map((item) => ({
    name: String(item.name || '').trim(),
    amount: parseAmount(item.amount) == null ? 0 : parseAmount(item.amount),
    note: String(item.note || '').trim(),
  }))
  const computedTotal =
    totalAmount != null
      ? parseAmount(totalAmount)
      : items.reduce((s, it) => s + (Number(it.amount) || 0), 0)
  return {
    chiefComplaint: String(chiefComplaint || '').trim(),
    workItems: items,
    totalAmount: computedTotal == null ? 0 : computedTotal,
    deliveryPhotos: mapPhotoRows(deliveryImages),
    warrantyPeriod: period,
    warrantyScope: scope,
    warrantyExclusions: exclusions,
    confirmCopy:
      String(confirmCopy || photoDraft.confirmCopy || '').trim() ||
      '本人确认上述施工与交车状态，并知悉质保条款。',
  }
}

function normalizePhotoDraft(raw = {}) {
  return {
    chiefComplaint: String(raw.chiefComplaint || '').trim(),
    conclusion: String(raw.conclusion || '').trim(),
    findings: Array.isArray(raw.findings)
      ? raw.findings.map((item) => normalizeFinding(item)).filter((item) => item.url)
      : [],
    warrantyPeriod: String(raw.warrantyPeriod || '').trim(),
    warrantyScope: String(raw.warrantyScope || '').trim(),
    warrantyExclusions: String(raw.warrantyExclusions || '').trim(),
    confirmCopy: String(raw.confirmCopy || '').trim(),
  }
}

/** 合并过程步草稿：仅覆盖显式传入的字段 */
function mergePhotoDraft(prev = {}, patch = {}) {
  const next = normalizePhotoDraft(prev)
  if (!patch || typeof patch !== 'object') return next
  if (patch.chiefComplaint != null) next.chiefComplaint = String(patch.chiefComplaint || '').trim()
  if (patch.conclusion != null) next.conclusion = String(patch.conclusion || '').trim()
  if (patch.findings != null) {
    next.findings = Array.isArray(patch.findings)
      ? patch.findings.map((item) => normalizeFinding(item)).filter((item) => item.url)
      : []
  }
  if (patch.warrantyPeriod != null) {
    next.warrantyPeriod = String(patch.warrantyPeriod || '').trim()
  }
  if (patch.warrantyScope != null) next.warrantyScope = String(patch.warrantyScope || '').trim()
  if (patch.warrantyExclusions != null) {
    next.warrantyExclusions = String(patch.warrantyExclusions || '').trim()
  }
  if (patch.confirmCopy != null) next.confirmCopy = String(patch.confirmCopy || '').trim()
  return next
}

module.exports = {
  mapPhotoRows,
  mapFindingRows,
  normalizeFinding,
  normalizeQuoteLine,
  normalizePhotoDraft,
  mergePhotoDraft,
  parseAmount,
  sumQuoteAmounts,
  collectInspectionReportGaps,
  collectDeliveryPhotoDraftGaps,
  collectQuoteConfirmGaps,
  buildInspectionReportPayload,
  buildWorkOrderPayloadFromQuote,
  buildQuoteLinesFromFindings,
  buildRepairReportPayload,
}
