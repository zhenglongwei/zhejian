/**
 * DOC-FLOW · 单据规则生成（无 LLM）
 * 真源：docs/04_维修过程相册/26_商家端事件节点与单据节点链流程.md §4
 */
const { INSPECTION_DISCLAIMER } = require('../constants/service-flow-nodes')

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

function normalizeFinding(raw = {}) {
  const caption = String(raw.caption || '').trim()
  return {
    imageId: String(raw.imageId || raw.id || ''),
    url: String(raw.url || ''),
    caption,
    captionEmpty: !caption,
    partName: String(raw.partName || caption || '').trim(),
    symptom: String(raw.symptom || '').trim(),
    result: String(raw.result || '').trim(),
    advice: String(raw.advice || '').trim(),
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
    gaps.push('请填写进店主诉/症状')
  }
  const findings = Array.isArray(payload.findings) ? payload.findings : []
  if (!findings.length) {
    gaps.push('请至少上传 1 张检测照片并填写发现项')
    return gaps
  }
  findings.forEach((raw, index) => {
    const item = normalizeFinding(raw)
    const label = item.partName || `第 ${index + 1} 项`
    if (!item.partName) gaps.push(`「${label}」请填写检查部位/项目`)
    if (!item.symptom) gaps.push(`「${label}」请填写现象/症状`)
    if (!item.result) gaps.push(`「${label}」请填写检查结果`)
    if (!item.advice) gaps.push(`「${label}」请填写处理建议`)
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
    const text = [item.partName, item.symptom, item.result, item.caption].join(' ')
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

function buildWorkOrderPayloadFromQuote(quotePayload = {}, sourceQuoteNodeId = '') {
  const lines = Array.isArray(quotePayload.lines) ? quotePayload.lines : []
  return {
    sourceQuoteNodeId,
    items: lines.map((line) => ({
      name: String(line.name || '').trim(),
      note: String(line.note || line.priceHint || '').trim(),
      technician: '',
      planNote: '',
    })),
  }
}

/** 报价草稿：从检测报告「处理建议」预填行项（商家可改） */
function buildQuoteLinesFromFindings(findings = []) {
  return (findings || [])
    .map((raw) => {
      const item = normalizeFinding(raw)
      if (!item.advice && !item.partName) return null
      return {
        name: item.advice || item.partName,
        note: [item.partName, item.symptom, item.result].filter(Boolean).join('；'),
        priceHint: '',
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
} = {}) {
  const period =
    String(warranty.period || photoDraft.warrantyPeriod || '').trim() || '以门店公示为准'
  const scope =
    String(warranty.scope || photoDraft.warrantyScope || '').trim() || '本次已确认施工项目'
  const exclusions =
    String(warranty.exclusions || photoDraft.warrantyExclusions || '').trim() ||
    '外力撞击、涉水、未按约定使用等除外'
  return {
    chiefComplaint: String(chiefComplaint || '').trim(),
    workItems: (workItems || []).map((item) => ({
      name: String(item.name || '').trim(),
      note: String(item.note || '').trim(),
    })),
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
  normalizePhotoDraft,
  mergePhotoDraft,
  collectInspectionReportGaps,
  collectDeliveryPhotoDraftGaps,
  buildInspectionReportPayload,
  buildWorkOrderPayloadFromQuote,
  buildQuoteLinesFromFindings,
  buildRepairReportPayload,
}
