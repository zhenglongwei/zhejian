const {
  NODE_CATEGORY,
  getFlowKindMeta,
  requiresOwnerConfirm,
} = require('../constants/service-flow-nodes')

function resolveFlowNodeCategoryLabel(node = {}) {
  if (node.nodeCategory === NODE_CATEGORY.PHOTO) return '拍照'
  if (node.nodeCategory === NODE_CATEGORY.DOCUMENT) return '单据'
  const meta = getFlowKindMeta(node.kind)
  if (meta && meta.nodeCategory === NODE_CATEGORY.PHOTO) return '拍照'
  if (meta && meta.nodeCategory === NODE_CATEGORY.DOCUMENT) return '单据'
  return ''
}

function resolveFlowNodeStatusVariant(node = {}) {
  const status = String(node.status || 'pending')
  if (status === 'completed' || status === 'in_progress') return 'success'
  if (status === 'pending_confirm') return 'warning'
  return 'default'
}

function resolveFlowNodeSummary(node = {}) {
  if (node.nodeCategory === NODE_CATEGORY.PHOTO || node.legacyStageId) {
    const count = Number(node.photoCount || 0)
    return count > 0 ? `已拍 ${count} 张` : '待上传照片'
  }
  const doc = node.document || {}
  if (doc.statusLabel) return doc.statusLabel
  if (doc.status === 'draft') return '草稿'
  return '待填写'
}

function buildFlowNodeDetailPath(albumId, node = {}) {
  const id = encodeURIComponent(String(albumId || ''))
  const nodeId = encodeURIComponent(String(node.id || ''))
  const isPhoto =
    node.nodeCategory === NODE_CATEGORY.PHOTO ||
    node.legacyStageId ||
    (node.legacyStageIds && node.legacyStageIds.length)
  if (isPhoto) {
    return `/packageMerchant/pages/album/flow/photo-node/index?albumId=${id}&nodeId=${nodeId}`
  }
  return `/packageMerchant/pages/album/flow/doc-node/index?albumId=${id}&nodeId=${nodeId}`
}

function usesFlowTimeline(album = {}) {
  if (album.usesFlowTimeline === true) return true
  return Number(album.flowVersion || 0) >= 1
}

module.exports = {
  resolveFlowNodeCategoryLabel,
  resolveFlowNodeStatusVariant,
  resolveFlowNodeSummary,
  buildFlowNodeDetailPath,
  usesFlowTimeline,
  requiresOwnerConfirm,
}
