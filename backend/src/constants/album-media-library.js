/**
 * 历史「本单图库」节点 id。产品已删除图库功能（2026-10-27）。
 * 仍识别旧数据里的 library 节点，便于卸下时清掉、展示时过滤。
 */
const LIBRARY_NODE_ID = 'library'

function isLibraryNodeId(nodeId) {
  return String(nodeId || '') === LIBRARY_NODE_ID
}

function excludeLibraryNodes(nodes = []) {
  return (nodes || []).filter((node) => !isLibraryNodeId(node && (node.id || node.nodeId)))
}

/**
 * 本次保存不再挂在流程步上的图：应卸下（删相册图行，不删对象存储），不再改挂到图库。
 * replaceAll：名单外一律卸下（含旧图库节点上的散图）。
 * patch：只处理被改的流程步；旧图库节点上的散图在任意 patch 时也可卸下（已无选用入口）。
 */
function listDetachedImageIds(existingImages = [], keepImageIds = [], options = {}) {
  const keep = new Set((keepImageIds || []).filter(Boolean))
  const replaceAll = Boolean(options.replaceAll)
  const patched = new Set((options.patchedNodeIds || []).filter(Boolean))
  return (existingImages || [])
    .filter((img) => {
      if (!img || !img.id) return false
      if (keep.has(img.id)) return false
      if (isLibraryNodeId(img.nodeId)) return true
      if (replaceAll) return true
      return patched.has(img.nodeId)
    })
    .map((img) => img.id)
}

module.exports = {
  LIBRARY_NODE_ID,
  isLibraryNodeId,
  excludeLibraryNodes,
  listDetachedImageIds,
}
