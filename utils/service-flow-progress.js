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
  if (node.kind === 'inspection_report' || node.kind === 'quote_confirm' || node.kind === 'repair_report') {
    return doc && doc.status === 'confirmed'
  }

  if (doc && typeof doc === 'object') {
    if (doc.status === 'confirmed') return true
    const meta = getFlowKindMeta(node.kind)
    if (meta && meta.requiresConfirm) return false
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
      desc: node.summary || node.document?.statusLabel || '已完成',
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
    return { text: '上传照片并确认', type: 'photo' }
  }
  const doc = node.document || {}
  if (doc.requiresConfirm && doc.status !== 'confirmed') {
    return { text: '填写并发送车主确认', type: 'confirm' }
  }
  return { text: '查看并填写单据', type: 'document' }
}

module.exports = {
  isFlowNodeDone,
  buildVisibleFlowNodes,
  buildFlowProgressView,
  resolveActiveNodeCta,
}
