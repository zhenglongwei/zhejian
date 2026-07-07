/**
 * 相册 AI 分析 · 内容指纹（节点说明/照片/单据/配件变更检测）
 */
const { normalizeImageList } = require('./album-evidence-items')

function sortById(list, idKey = 'id') {
  return [...list].sort((a, b) =>
    String(a[idKey] || '').localeCompare(String(b[idKey] || '')),
  )
}

function hashString(text) {
  let hash = 5381
  const str = String(text || '')
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return `fp_${(hash >>> 0).toString(16)}`
}

function buildAlbumInspectionContentFingerprint(detail = {}) {
  const nodes = sortById(detail.nodes || [], 'id').map((node) => ({
    id: String(node.id || node.nodeId || '').trim(),
    note: String(node.note || '').trim(),
    images: normalizeImageList(node.images).slice().sort(),
  }))

  const evidenceItems = sortById(detail.evidenceItems || [], 'id').map((item) => ({
    id: String(item.id || '').trim(),
    stageId: String(item.stageId || '').trim(),
    label: String(item.label || '').trim(),
    images: normalizeImageList(item.images).slice().sort(),
  }))

  const parts = sortById(detail.parts || [], 'partId').map((part) => ({
    id: String(part.partId || part.id || '').trim(),
    name: String(part.partName || part.name || '').trim(),
    photos: normalizeImageList(part.photos || []).slice().sort(),
  }))

  const planParts = sortById(detail.planParts || [], 'planPartId').map((part) => ({
    id: String(part.planPartId || part.id || '').trim(),
    name: String(part.name || part.partName || '').trim(),
  }))

  const snapshot = {
    storeNote: String(detail.storeNote || '').trim(),
    nodes,
    evidenceItems,
    parts,
    planParts,
  }

  return hashString(JSON.stringify(snapshot))
}

module.exports = {
  buildAlbumInspectionContentFingerprint,
  hashString,
}
