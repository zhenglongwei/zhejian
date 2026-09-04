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

function buildInspectionReportPayload({ vehicle = {}, albumNodes = [], chiefComplaint = '' } = {}) {
  const intake = (albumNodes || []).find((n) => n.id === 'stage_1')
  const inspection = (albumNodes || []).find((n) => n.id === 'stage_2')
  const intakePhotos = mapPhotoRows(intake && intake.images)
  const findings = mapPhotoRows(inspection && inspection.images)
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
  buildInspectionReportPayload,
  buildWorkOrderPayloadFromQuote,
  buildRepairReportPayload,
}
