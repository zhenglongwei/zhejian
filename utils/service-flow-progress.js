/**
 * DOC-FLOW · 节点解锁与渐进展示
 */
const {
  getFlowKindMeta,
  requiresOwnerConfirm,
  isPhotoFlowNode,
} = require('../constants/service-flow-nodes')

function isFlowNodeDone(node = {}) {
  if (!node || !node.id) return false
  const status = String(node.status || 'pending')
  if (status === 'completed') return true

  const doc = node.document
  const kind = node.kind || (doc && doc.docType) || ''

  // 检测报告：送达即完成
  if (kind === 'inspection_report') {
    return Boolean(doc && (doc.status === 'delivered' || doc.status === 'confirmed'))
  }

  // 方案确认 / 完工确认：需 confirmed
  if (kind === 'quote_confirm' || kind === 'repair_report' || kind === 'addon_quote_confirm') {
    return Boolean(doc && doc.status === 'confirmed')
  }

  // 工单：商家开始施工后节点 status=completed，或 document 标记 started
  if (kind === 'work_order') {
    if (status === 'completed') return true
    return Boolean(doc && (doc.status === 'in_progress' || doc.payload && doc.payload.startedAt))
  }

  if (doc && typeof doc === 'object') {
    if (doc.status === 'confirmed' || doc.status === 'delivered') return true
    if (requiresOwnerConfirm(node)) return false
    return doc.status === 'sent'
  }

  if (isPhotoFlowNode(node) || node.nodeCategory === 'photo') {
    return status === 'completed'
  }
  return false
}

/** 仅展示：已完成链 + 当前一步（未展示后续） */
function buildVisibleFlowNodes(nodes = []) {
  const sorted = (nodes || [])
    .slice()
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
  const visible = []
  for (let i = 0; i < sorted.length; i += 1) {
    visible.push(sorted[i])
    if (!isFlowNodeDone(sorted[i])) break
  }
  return visible
}

function buildFlowProgressView(nodes = []) {
  const sorted = (nodes || [])
    .slice()
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
  const visible = buildVisibleFlowNodes(sorted)
  const completed = visible.filter((node) => isFlowNodeDone(node))
  const active = visible.find((node) => !isFlowNodeDone(node)) || null
  const totalSteps = sorted.length
  const currentStep = active ? completed.length + 1 : completed.length

  return {
    totalSteps,
    currentStep,
    completedCount: completed.length,
    allDone: sorted.length > 0 && completed.length === sorted.length,
    completedSteps: completed.map((node) => ({
      id: node.id,
      title: node.title,
      summary: node.summary || (node.document && node.document.statusLabel) || '已完成',
      status: 'done',
    })),
    activeNode: active,
    lockedHint: active
      ? '完成当前步骤后，将自动出现下一步'
      : allDoneText(sorted.length),
  }
}

function allDoneText(total) {
  if (!total) return ''
  return '全部步骤已完成，可标记整单完工'
}

function resolveActiveNodeCta(node = {}) {
  if (!node) return { text: '', type: '' }
  if (node.nodeCategory === 'photo' || node.legacyStageId || node.legacyStageIds) {
    return { text: '上传并确认', type: 'photo' }
  }
  const doc = node.document || {}
  if (node.kind === 'inspection_report' && doc.status !== 'delivered') {
    return { text: '通知车主', type: 'notify' }
  }
  if (requiresOwnerConfirm(node) && doc.status !== 'confirmed') {
    return { text: '发送确认', type: 'confirm' }
  }
  if (node.kind === 'work_order') {
    return { text: '开始施工', type: 'start_work' }
  }
  return { text: '查看', type: 'document' }
}

module.exports = {
  isFlowNodeDone,
  buildVisibleFlowNodes,
  buildFlowProgressView,
  resolveActiveNodeCta,
}
