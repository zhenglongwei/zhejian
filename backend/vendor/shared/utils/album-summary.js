/**
 * 服务相册档案摘要聚合 — B-ALB-08
 * 口径：docs/02_用户端小程序/07_维修相册查看页.md §14.4
 */

const STAGE_IDS = {
  RECEIVE: 'stage_1',
  INSPECTION: 'stage_2',
  PLAN: 'stage_3',
  PARTS: 'stage_4',
}

function truncateText(text, maxLen) {
  const s = String(text || '').trim()
  if (!s) return ''
  if (s.length <= maxLen) return s
  return `${s.slice(0, maxLen)}…`
}

function extractFirstSentence(text) {
  const s = String(text || '').trim()
  if (!s) return ''
  const match = s.match(/^[^。！？.!?\n]+/)
  return (match ? match[0] : s).trim()
}

function findNodeNote(nodes, stageId) {
  const list = Array.isArray(nodes) ? nodes : []
  const node = list.find(
    (n) => n && (n.id === stageId || n.nodeId === stageId),
  )
  return node ? String(node.note || '').trim() : ''
}

function normalizePartName(part) {
  if (!part || typeof part !== 'object') return ''
  return String(part.name || part.partName || '').trim()
}

function normalizePartQty(part) {
  const qty = Number(part.qty ?? part.quantity ?? part.count)
  return Number.isFinite(qty) && qty > 0 ? qty : 1
}

function parseDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatDateYMD(value) {
  const d = parseDate(value)
  if (!d) return '—'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDeliverDateText(value) {
  const d = parseDate(value)
  if (!d) return ''
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `送修 ${m}-${day}`
}

/** 列表卡档案编号式日期（UI-ALB-G） */
function formatArchivalDateText(value) {
  const d = parseDate(value)
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y} · ${m} · ${day}`
}

function formatUpdatedAtDisplay(value) {
  const d = parseDate(value)
  if (!d) return ''
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${m}-${day} ${hour}:${minute}`
}

function buildMileageText(vehicle) {
  if (!vehicle || typeof vehicle !== 'object') return '—'
  const raw = vehicle.mileage
  if (raw == null || raw === '') return '—'
  const num = Number(String(raw).replace(/,/g, ''))
  if (Number.isFinite(num) && num > 0) {
    return `${num.toLocaleString('zh-CN')} km`
  }
  const text = String(raw).trim()
  return text ? `${text} km` : '—'
}

function resolveIssueDesc(vehicle, nodes) {
  const fromReceive = extractFirstSentence(findNodeNote(nodes, STAGE_IDS.RECEIVE))
  if (fromReceive) return fromReceive
  const fromVehicle = extractFirstSentence(
    vehicle.issueDesc || vehicle.faultDesc || vehicle.fault || '',
  )
  if (fromVehicle) return fromVehicle
  return truncateText(findNodeNote(nodes, STAGE_IDS.INSPECTION), 24)
}

function resolveInspectionResult(nodes) {
  const note = findNodeNote(nodes, STAGE_IDS.INSPECTION)
  return note ? truncateText(note, 48) : ''
}

function resolveRepairSolution(nodes, storeNote) {
  const fromPlan = findNodeNote(nodes, STAGE_IDS.PLAN)
  if (fromPlan) return truncateText(fromPlan, 48)
  const note = String(storeNote || '').trim()
  return note ? truncateText(note, 48) : ''
}

function buildPartsSummary(partsJson) {
  const list = (Array.isArray(partsJson) ? partsJson : []).filter((p) =>
    normalizePartName(p),
  )
  if (!list.length) return ''
  const head = list
    .slice(0, 2)
    .map((p) => `${normalizePartName(p)}×${normalizePartQty(p)}`)
    .join('、')
  if (list.length <= 2) return head
  return `${head} 等 ${list.length} 项`
}

function buildSummaryPriceText(privatePrice = {}) {
  const planAmount = privatePrice.planAmount
  if (planAmount != null && Number(planAmount) > 0) {
    return `¥${planAmount}`
  }
  const minAmount = privatePrice.minAmount
  const maxAmount = privatePrice.maxAmount
  if (
    minAmount != null &&
    maxAmount != null &&
    Number(minAmount) > 0 &&
    Number(maxAmount) >= Number(minAmount)
  ) {
    if (Number(minAmount) === Number(maxAmount)) {
      return `¥${minAmount}`
    }
    return `¥${minAmount}-${maxAmount}`
  }
  return ''
}

function buildSummaryLine({ issueDesc, partsSummary, summaryPriceText }) {
  const segments = []
  if (issueDesc) segments.push(issueDesc)
  if (partsSummary) segments.push(partsSummary)
  if (summaryPriceText) segments.push(summaryPriceText)
  if (!segments.length) return ''
  const line = segments.join(' · ')
  return line.length > 40 ? `${line.slice(0, 39)}…` : line
}

function normalizePartsForView(partsJson, nodes) {
  const partsNode = (Array.isArray(nodes) ? nodes : []).find(
    (n) => n && (n.id === STAGE_IDS.PARTS || n.nodeId === STAGE_IDS.PARTS),
  )
  const fallbackThumb =
    partsNode && Array.isArray(partsNode.images) && partsNode.images[0]
      ? partsNode.images[0]
      : ''

  return (Array.isArray(partsJson) ? partsJson : [])
    .filter((p) => normalizePartName(p))
    .map((p) => {
      const photos = Array.isArray(p.photos) ? p.photos : []
      const thumbUrl = photos[0] || fallbackThumb || ''
      return {
        partId: p.partId || p.id || '',
        name: normalizePartName(p),
        partName: normalizePartName(p),
        partType: p.partType || '',
        qty: normalizePartQty(p),
        thumbUrl,
        photos,
      }
    })
}

function buildSummaryRows(input = {}) {
  const {
    createdAt,
    updatedAt,
    serviceName,
    storeName,
    vehicleDisplay,
    vehicle,
    nodes,
    storeNote,
    imageCount,
    planAmount,
    formatPlanAmountLabel,
  } = input

  const issueDesc = resolveIssueDesc(vehicle, nodes)
  const inspectionResult = resolveInspectionResult(nodes)
  const repairSolution = resolveRepairSolution(nodes, storeNote)
  const partsSummary = buildPartsSummary(input.partsJson)

  const rows = [
    { label: '送修日期', value: formatDateYMD(createdAt) },
    { label: '更新时间', value: formatUpdatedAtDisplay(updatedAt) || '—' },
    { label: '服务项目', value: serviceName || '—' },
    { label: '门店', value: storeName || '—' },
    { label: '车辆', value: vehicleDisplay || '—' },
    { label: '里程', value: buildMileageText(vehicle) },
  ]

  if (issueDesc) {
    rows.push({ label: '故障/损伤', value: issueDesc })
  }
  if (inspectionResult) {
    rows.push({ label: '检测结果', value: inspectionResult })
  }
  if (repairSolution) {
    rows.push({ label: '维修方案', value: repairSolution })
  }
  if (partsSummary) {
    rows.push({ label: '配件摘要', value: partsSummary })
  }
  if (planAmount != null && Number(planAmount) > 0) {
    const label =
      typeof formatPlanAmountLabel === 'function'
        ? formatPlanAmountLabel(planAmount)
        : `¥${planAmount}`
    rows.push({ label: '方案报价', value: label })
  }
  rows.push({
    label: '图片总数',
    value: `${Number(imageCount) || 0} 张`,
  })

  return rows
}

/**
 * @param {object} album 原始相册（含 nodes / partsJson / vehicleJson）
 * @param {object} viewCtx buildAlbumView 已算字段
 * @param {object} privatePrice buildPrivateAlbumPrice 产物
 */
function buildAlbumSummaryFields(album, viewCtx = {}, privatePrice = {}) {
  const vehicle = album.vehicleJson || viewCtx.vehicle || {}
  const nodes = viewCtx.nodes || []
  const partsJson = album.partsJson || viewCtx.parts || []

  const issueDesc = resolveIssueDesc(vehicle, nodes)
  const partsSummary = buildPartsSummary(partsJson)
  const summaryPriceText = buildSummaryPriceText(privatePrice)
  const summaryLine = buildSummaryLine({
    issueDesc,
    partsSummary,
    summaryPriceText,
  })

  const summaryRows = buildSummaryRows({
    createdAt: album.createdAt || viewCtx.createdAt,
    updatedAt: album.updatedAt || viewCtx.updatedAt,
    serviceName: viewCtx.serviceName || album.serviceName,
    storeName: viewCtx.store?.name || album.storeName,
    vehicleDisplay: viewCtx.vehicleDisplay,
    vehicle,
    nodes,
    storeNote: album.storeNote || viewCtx.storeNote,
    imageCount: viewCtx.imageCount,
    planAmount: privatePrice.planAmount,
    partsJson,
    formatPlanAmountLabel: viewCtx.formatPlanAmountLabel,
  })

  const { buildAlbumAiSummary } = require('./album-ai-summary')
  const aiSummary = buildAlbumAiSummary({
    serviceName: viewCtx.serviceName || album.serviceName,
    vehicle,
    nodes,
    storeNote: album.storeNote || viewCtx.storeNote,
    storeName: viewCtx.store?.name || album.storeName,
    city: viewCtx.store?.city || album.storeCity || '',
    partsJson,
    imageCount: viewCtx.imageCount,
    scene: viewCtx.aiSummaryScene || 'private',
  })

  return {
    deliverDateText: formatDeliverDateText(album.createdAt || viewCtx.createdAt),
    summaryLine,
    summaryRows,
    partsSummary,
    parts: normalizePartsForView(partsJson, nodes),
    issueDesc,
    inspectionResult: resolveInspectionResult(nodes),
    repairSolution: resolveRepairSolution(nodes, album.storeNote || viewCtx.storeNote),
    mileageText: buildMileageText(vehicle),
    updatedAtText: formatUpdatedAtDisplay(album.updatedAt || viewCtx.updatedAt),
    aiSummary,
  }
}

module.exports = {
  STAGE_IDS,
  buildAlbumSummaryFields,
  buildSummaryRows,
  buildSummaryLine,
  buildPartsSummary,
  formatDeliverDateText,
  formatArchivalDateText,
  formatDateYMD,
  formatUpdatedAtDisplay,
  resolveIssueDesc,
  resolveInspectionResult,
  resolveRepairSolution,
}
