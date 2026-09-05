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

/** 检测发现项：对标店内报告「部位 / 现象 / 结果 / 建议」 */
function mapFindingRows(images = []) {
  return mapPhotoRows(images).map((row) => ({
    ...row,
    partName: row.caption || '',
    symptom: '',
    result: '',
    advice: '',
  }))
}

function normalizeFinding(raw = {}) {
  return {
    imageId: String(raw.imageId || ''),
    url: String(raw.url || ''),
    caption: String(raw.caption || '').trim(),
    captionEmpty: !String(raw.caption || '').trim(),
    partName: String(raw.partName || raw.caption || '').trim(),
    symptom: String(raw.symptom || '').trim(),
    result: String(raw.result || '').trim(),
    advice: String(raw.advice || '').trim(),
  }
}

function collectInspectionReportGaps(payload = {}) {
  const gaps = []
  if (!String(payload.chiefComplaint || '').trim()) {
    gaps.push('请填写进店主诉/症状')
  }
  const findings = Array.isArray(payload.findings) ? payload.findings : []
  if (!findings.length) {
    gaps.push('暂无检测照片，请先完成接车与检测')
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

function buildInspectionReportPayload({ vehicle = {}, albumNodes = [], chiefComplaint = '' } = {}) {
  const intake = (albumNodes || []).find((n) => n.id === 'stage_1')
  const inspection = (albumNodes || []).find((n) => n.id === 'stage_2')
  const intakePhotos = mapPhotoRows(intake && intake.images)
  const findings = mapFindingRows(inspection && inspection.images)
  const mileageFromCaption = intakePhotos.find((p) => p.caption && /\d/.test(p.caption))
  return {
    vehicleBrand: String(vehicle.brand || ''),
    vehicleSeries: String(vehicle.series || ''),
    vehicleYear: String(vehicle.modelYear || vehicle.year || ''),
    mileageText:
      String(vehicle.mileage || vehicle.mileageKm || '').trim() ||
      (mileageFromCaption ? mileageFromCaption.caption : ''),
    chiefComplaint: String(chiefComplaint || '').trim(),
    reportDate: new Date().toISOString().slice(0, 10),
    intakePhotos,
    findings,
    disclaimer: INSPECTION_DISCLAIMER,
    conclusion: '',
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
} = {}) {
  return {
    chiefComplaint: String(chiefComplaint || '').trim(),
    workItems: (workItems || []).map((item) => ({
      name: String(item.name || '').trim(),
      note: String(item.note || '').trim(),
    })),
    deliveryPhotos: mapPhotoRows(deliveryImages),
    warrantyPeriod: String(warranty.period || '以门店公示为准'),
    warrantyScope: String(warranty.scope || '本次已确认施工项目'),
    warrantyExclusions: String(warranty.exclusions || '外力撞击、涉水、未按约定使用等除外'),
    confirmCopy: '本人确认上述施工与交车状态，并知悉质保条款。',
  }
}

module.exports = {
  mapPhotoRows,
  mapFindingRows,
  normalizeFinding,
  collectInspectionReportGaps,
  buildInspectionReportPayload,
  buildWorkOrderPayloadFromQuote,
  buildQuoteLinesFromFindings,
  buildRepairReportPayload,
}
