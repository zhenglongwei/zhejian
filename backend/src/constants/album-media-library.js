/** 本单图库：照片必须挂 AlbumNode，从项上卸下后收到此节点，不删文件、不删行 */
const LIBRARY_NODE_ID = 'library'

function isLibraryNodeId(nodeId) {
  return String(nodeId || '') === LIBRARY_NODE_ID
}

function excludeLibraryNodes(nodes = []) {
  return (nodes || []).filter((node) => !isLibraryNodeId(node && (node.id || node.nodeId)))
}

/**
 * 本次保存不再挂在流程步上的图，应收到图库，而不是删库行。
 * replaceAll：名单外一律收进图库（含原在图库、未写入本次名单的图，收纳为无操作）。
 * patch：只处理被改的流程步，不动已在图库且未列入 patch 的图。
 */
function listDetachedImageIds(existingImages = [], keepImageIds = [], options = {}) {
  const keep = new Set((keepImageIds || []).filter(Boolean))
  const replaceAll = Boolean(options.replaceAll)
  const patched = new Set((options.patchedNodeIds || []).filter(Boolean))
  return (existingImages || [])
    .filter((img) => {
      if (!img || !img.id) return false
      if (keep.has(img.id)) return false
      if (isLibraryNodeId(img.nodeId) && !patched.has(LIBRARY_NODE_ID) && !replaceAll) {
        return false
      }
      if (replaceAll) return !isLibraryNodeId(img.nodeId)
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
