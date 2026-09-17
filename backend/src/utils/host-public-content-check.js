/**
 * 公开托管前内容检查（软建议，不挡公开）
 * 真源：docs/01_项目总览与业务架构/15_案例档案与托管状态机.md §7.11
 */
const { FINDING_RESULT, findingAdviceRequired } = require('../../vendor/shared/constants/service-flow-nodes')

const QR_HINT = /二维码|微信码|加微信|名片|公众号码/
const VAGUE_COMPLAINT =
  /^(定时)?保养$|^常规保养$|^例行保养$|^到店保养$|^年审$|^检查$|^维修$|^保养一下$/
const CATALOG_VEHICLE =
  /\([^)]*\d{4}\.\d{2}|手动;自动|驱动形式|[A-Z]{1,3}\d{4,}\(|\d{4}\.\d{2}-/
const THIN_SUMMARY = /含过程图片记录|过程图片记录/

function text(value) {
  return String(value || '').trim()
}

function pushTip(list, item) {
  if (!item || !item.issue || list.some((row) => row.issue === item.issue)) return
  list.push({
    issue: item.issue,
    title: item.title || '',
    suggestion: item.suggestion || '',
  })
}

function looksLikeCatalogVehicleText(value) {
  return CATALOG_VEHICLE.test(text(value))
}

function isVagueChiefComplaint(value) {
  const s = text(value)
  if (!s) return true
  if (s.length <= 2) return true
  return VAGUE_COMPLAINT.test(s)
}

function flowNodesOf(album) {
  const pkg = (album && album.contentPackageJson) || {}
  return Array.isArray(pkg.flowNodes) ? pkg.flowNodes : []
}

function findFlow(nodes, kind) {
  return (nodes || []).find((node) => node && node.kind === kind) || null
}

function collectFindingRows({ flowNodes, reviewDocs }) {
  const rows = []
  const report = findFlow(flowNodes, 'inspection_report')
  const payload = (report && report.document && report.document.payload) || {}
  ;(Array.isArray(payload.findings) ? payload.findings : []).forEach((row) => {
    if (row) rows.push(row)
  })
  const intake = findFlow(flowNodes, 'intake_inspection')
  const draft = (intake && intake.photoDraft) || {}
  ;(Array.isArray(draft.findings) ? draft.findings : []).forEach((row) => {
    if (row) rows.push(row)
  })
  ;(Array.isArray(reviewDocs) ? reviewDocs : []).forEach((doc) => {
    ;(Array.isArray(doc && doc.findings) ? doc.findings : []).forEach((row) => {
      if (row) rows.push(row)
    })
  })
  return rows
}

function collectCaptionPool({ flowNodes, reviewDocs }) {
  const pool = []
  collectFindingRows({ flowNodes, reviewDocs }).forEach((row) => {
    pool.push(row.partName, row.caption, row.advice, row.note)
  })
  ;(Array.isArray(reviewDocs) ? reviewDocs : []).forEach((doc) => {
    pool.push(doc && doc.title)
    ;(Array.isArray(doc && doc.deliveryPhotos) ? doc.deliveryPhotos : []).forEach((photo) => {
      if (typeof photo === 'string') return
      pool.push(photo && photo.caption, photo && photo.partName)
    })
  })
  return pool.map(text).filter(Boolean)
}

function resolveMileageKm({ vehicle, flowNodes }) {
  const intake = findFlow(flowNodes, 'intake_inspection')
  const draft = (intake && intake.photoDraft) || {}
  const report = findFlow(flowNodes, 'inspection_report')
  const payload = (report && report.document && report.document.payload) || {}
  return (
    text(draft.mileageKm) ||
    text(vehicle && (vehicle.mileage || vehicle.mileageKm)) ||
    text(payload.mileageText)
  )
}

function resolveChiefComplaint({ flowNodes, reviewDocs }) {
  const intake = findFlow(flowNodes, 'intake_inspection')
  const draft = (intake && intake.photoDraft) || {}
  const report = findFlow(flowNodes, 'inspection_report')
  const payload = (report && report.document && report.document.payload) || {}
  const fromReview = (Array.isArray(reviewDocs) ? reviewDocs : []).find(
    (doc) => doc && doc.kind === 'inspection_report',
  )
  return (
    text(draft.chiefComplaint) ||
    text(payload.chiefComplaint) ||
    text(fromReview && fromReview.chiefComplaint)
  )
}

function resolveVehicleBlob({ vehicle, flowNodes, view }) {
  const intake = findFlow(flowNodes, 'intake_inspection')
  const draft = (intake && intake.photoDraft) || {}
  return [
    draft.vehicleBrand,
    draft.vehicleSeries,
    draft.vehicleYear,
    vehicle && vehicle.brand,
    vehicle && vehicle.series,
    vehicle && vehicle.modelYear,
    vehicle && vehicle.engineModel,
    vehicle && vehicle.chassisCode,
    view && view.vehicleDisplay,
  ]
    .map(text)
    .filter(Boolean)
    .join(' ')
}

/**
 * @returns {{ suggestions: { issue: string, title: string, suggestion: string }[] }}
 */
function assessHostPublicContent(input = {}) {
  const album = input.album || {}
  const view = input.view || {}
  const geoDraft = input.geoDraft || {}
  const reviewDocs = input.reviewDocs || []
  const vehicle = view.vehicle || album.vehicleJson || album.vehicle || {}
  const flowNodes = Array.isArray(input.flowNodes) ? input.flowNodes : flowNodesOf(album)
  const suggestions = []

  if (!resolveMileageKm({ vehicle, flowNodes })) {
    pushTip(suggestions, {
      issue: 'missing_mileage',
      title: '缺当前里程',
      suggestion: '回接车步填公里数。仪表照只作证据，不要把仪表图当成发现项。',
    })
  }

  const complaint = resolveChiefComplaint({ flowNodes, reviewDocs })
  if (isVagueChiefComplaint(complaint)) {
    pushTip(suggestions, {
      issue: 'vague_complaint',
      title: '主诉过泛',
      suggestion: '写成车主现象，例如「电瓶亏电打不着」，不要只写「保养」。',
    })
  }

  if (looksLikeCatalogVehicleText(resolveVehicleBlob({ vehicle, flowNodes, view }))) {
    pushTip(suggestions, {
      issue: 'catalog_vehicle',
      title: '车型像目录串',
      suggestion: '接车步把对外车型改成品牌、车系、年款，不要带公告号或「手动;自动」。',
    })
  }

  const findings = collectFindingRows({ flowNodes, reviewDocs })
  const needsAdvice = findings.some((row) => {
    const result = text(row.result)
    if (!findingAdviceRequired(result) && result !== FINDING_RESULT.ACTION && result !== FINDING_RESULT.WATCH) {
      return false
    }
    const advice = text(row.advice)
    return !advice || advice === '无需处理'
  })
  if (needsAdvice) {
    pushTip(suggestions, {
      issue: 'missing_advice',
      title: '处理建议没写清',
      suggestion: '需关注 / 待处理的部位写一句可执行建议，例如「更换电瓶」。',
    })
  }

  if (collectCaptionPool({ flowNodes, reviewDocs }).some((row) => QR_HINT.test(row))) {
    pushTip(suggestions, {
      issue: 'qr_caption',
      title: '图注像微信码',
      suggestion: '完工外观请拍车身，不要拍码或名片；有码的图请换掉或打码。',
    })
  }

  const summary = text(geoDraft.summary)
  if (summary) {
    if (THIN_SUMMARY.test(summary) || looksLikeCatalogVehicleText(summary)) {
      pushTip(suggestions, {
        issue: 'thin_summary',
        title: '摘要还是目录句',
        suggestion: '改成：为何来、查了什么、怎么处理。',
      })
    }
    const faq = Array.isArray(geoDraft.faq) ? geoDraft.faq : []
    const answered = faq.filter((row) => text(row && (row.a || row.answer))).length
    if (!answered) {
      pushTip(suggestions, {
        issue: 'empty_faq',
        title: '本单问答还空着',
        suggestion: '补 3～4 条本单能核对的问法；空着的不会出现在公开页。',
      })
    }
  }

  return { suggestions: suggestions.slice(0, 8) }
}

module.exports = {
  assessHostPublicContent,
  looksLikeCatalogVehicleText,
  isVagueChiefComplaint,
}
