const {
  SERVICE_ALBUM_REPAIR_DONE_STATUSES,
  PUBLIC_CASE_STATUS,
} = require('../constants/v2')
const { ownerVisiblePlate } = require('./plate-mask')
const { isFlowNodeDone } = require('../../vendor/shared/utils/service-flow-progress')

const STEPS = [
  { label: '接车', kinds: ['intake'] },
  { label: '检测', kinds: ['inspection', 'inspection_report'] },
  { label: '报价', kinds: ['quote_confirm'] },
  { label: '施工', kinds: ['work'] },
  { label: '完工', kinds: ['delivery_photos', 'repair_report'] },
]

function isRepairDone(status) {
  return SERVICE_ALBUM_REPAIR_DONE_STATUSES.includes(status)
}

function docOf(node = {}) {
  return node.document || node.doc || {}
}

function isQuotePending(node = {}) {
  const kind = String(node.kind || '')
  if (kind !== 'quote_confirm' && kind !== 'addon_quote_confirm') return false
  return String(docOf(node).status || '') === 'pending_confirm'
}

function resolveSteps(flowNodes) {
  const nodes = Array.isArray(flowNodes) ? flowNodes : []
  if (!nodes.length) return null
  const doneFlags = STEPS.map((step, index) => {
    const related = nodes.filter((node) => step.kinds.includes(node.kind))
    if (related.length) return related.every(isFlowNodeDone)
    const laterStarted = STEPS.slice(index + 1).some((next) =>
      nodes.some((node) => next.kinds.includes(node.kind)),
    )
    return laterStarted
  })
  let foundCurrent = false
  return STEPS.map((step, index) => {
    let state = 'todo'
    if (doneFlags[index]) state = 'done'
    else if (!foundCurrent) {
      state = 'current'
      foundCurrent = true
    }
    return { label: step.label, state }
  })
}

function fallbackSteps(repairDone) {
  return STEPS.map((step, index) => ({
    label: step.label,
    state: repairDone ? 'done' : index === 0 ? 'current' : 'todo',
  }))
}

function resolvePill(repairDone, quotePending, steps) {
  if (repairDone) return { pill: '已交车', pillTone: 'green' }
  if (quotePending) return { pill: '待确认', pillTone: 'amber' }
  const current = (steps || []).find((step) => step.state === 'current')
  if (current && current.label === '施工') return { pill: '施工中', pillTone: 'blue' }
  if (current && current.label === '完工') return { pill: '交车中', pillTone: 'blue' }
  return { pill: '进行中', pillTone: 'blue' }
}

function progressOf(steps) {
  const list = steps || []
  if (!list.length) return 0
  if (list.every((step) => step.state === 'done')) return 100
  const doneCount = list.filter((step) => step.state === 'done').length
  const currentBonus = list.some((step) => step.state === 'current') ? 0.35 : 0
  return Math.round(((doneCount + currentBonus) / list.length) * 100)
}

function vehicleLine(vehicle = {}) {
  const parts = [vehicle.brand, vehicle.series, vehicle.modelYear]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
  return parts.join(' · ')
}

function plateOf(vehicle = {}) {
  return ownerVisiblePlate(vehicle) || '未登记车牌'
}

function matchMerchantAlbumTab(card = {}, tab = 'all') {
  const key = String(tab || 'all')
  if (key === 'done') return Boolean(card.repairDone)
  if (key === 'confirm') return Boolean(card.quotePending) && !card.repairDone
  if (key === 'active') return !card.repairDone
  return true
}

function reviewLineForAlbum(repairDone, review) {
  if (!repairDone) return ''
  if (!review) return '还没有评价'
  const score = Number(review.overallScore) || 0
  const text = String(review.content || '').trim().replace(/\s+/g, ' ')
  const short = text.length > 18 ? `${text.slice(0, 18)}…` : text
  if (score && short) return `${score} 分 · ${short}`
  if (score) return `${score} 分`
  if (short) return short
  return '还没有评价'
}

function buildMerchantHubCard(input = {}) {
  const repairDone = isRepairDone(input.status)
  const nodes = Array.isArray(input.flowNodes) ? input.flowNodes : []
  const quotePending = !repairDone && nodes.some(isQuotePending)
  const steps = resolveSteps(nodes) || fallbackSteps(repairDone)
  const pill = resolvePill(repairDone, quotePending, steps)
  return {
    plate: plateOf(input.vehicle),
    modelLine: vehicleLine(input.vehicle),
    serviceName: String(input.serviceName || '').trim(),
    ...pill,
    progress: progressOf(steps),
    steps,
    quotePending,
    repairDone,
    publicOnSite: input.publicCaseStatus === PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
    createdAt: input.createdAt || '',
    completedAt: input.completedAt || '',
    updatedAt: input.updatedAt || '',
  }
}

module.exports = {
  STEPS,
  buildMerchantHubCard,
  matchMerchantAlbumTab,
  reviewLineForAlbum,
  progressOf,
  resolveSteps,
}
