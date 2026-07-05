/**
 * 服务相册 · 结构化 evidenceItems（B-EVID-01）
 * 商家分槽上传 ↔ 车主检查页单据 presence 同源
 */
const {
  DOCUMENT_TYPES,
  EVIDENCE_CATEGORY,
  resolveDocumentTypesForTemplate,
  resolveMerchantEvidenceLabel,
  bumpStrengthForAccident,
  templateMatches,
} = require('../constants/album-evidence-guide')

function normalizeImageList(images) {
  return (images || []).map((url) => String(url || '').trim()).filter(Boolean)
}

function buildDocumentEvidenceCatalog(templateId = '') {
  const tpl = String(templateId || '').trim()
  return resolveDocumentTypesForTemplate(tpl).map((def) => {
    const strength = bumpStrengthForAccident(def.strength, tpl)
    return {
      id: def.id,
      category: EVIDENCE_CATEGORY.DOCUMENT,
      type: def.id,
      stageId: def.stageId,
      label: def.label,
      strength,
      merchantLabel: resolveMerchantEvidenceLabel(strength),
      merchantHint: def.merchantHint || '',
      images: [],
    }
  })
}

function findNodeImages(nodes, stageId) {
  const node = (nodes || []).find(
    (n) => n && (n.id === stageId || n.nodeId === stageId),
  )
  return normalizeImageList(node && node.images)
}

function hydrateEvidenceItems({ templateId = '', savedItems = [], nodes = [] } = {}) {
  const catalog = buildDocumentEvidenceCatalog(templateId)
  const savedById = {}
  ;(savedItems || []).forEach((item) => {
    if (item && item.id) savedById[item.id] = item
  })

  const legacyAssigned = {}
  return catalog.map((def) => {
    const saved = savedById[def.id] || {}
    let images = normalizeImageList(saved.images)
    if (!images.length) {
      const legacyKey = def.stageId
      if (!legacyAssigned[legacyKey]) {
        legacyAssigned[legacyKey] = findNodeImages(nodes, legacyKey)
      }
      const legacyPool = legacyAssigned[legacyKey] || []
      if (legacyPool.length && def.id === defaultLegacySlotForStage(def.stageId, templateId)) {
        images = legacyPool.slice()
      }
    }
    return {
      ...def,
      images,
    }
  })
}

function defaultLegacySlotForStage(stageId, templateId) {
  if (stageId === 'stage_3') {
    return templateMatches(DOCUMENT_TYPES.loss_assessment, templateId)
      ? 'repair_quote'
      : 'repair_quote'
  }
  if (stageId === 'stage_5') return 'work_order'
  if (stageId === 'stage_6') return 'settlement'
  return ''
}

function filterEvidenceByStage(evidenceItems, stageId) {
  return (evidenceItems || []).filter((item) => item && item.stageId === stageId)
}

function resolveProcessImagesForStage(node, evidenceItems) {
  const stageId = (node && (node.id || node.nodeId)) || ''
  const docSet = new Set()
  filterEvidenceByStage(evidenceItems, stageId).forEach((item) => {
    normalizeImageList(item.images).forEach((url) => docSet.add(url))
  })
  return normalizeImageList(node && node.images).filter((url) => !docSet.has(url))
}

function applyProcessOnlyNodes(nodes, evidenceItems) {
  return (nodes || []).map((node) => {
    const stageId = node.id || node.nodeId
    if (!stageId || stageId === 'stage_3') {
      return { ...node, images: resolveProcessImagesForStage(node, evidenceItems) }
    }
    if (stageId === 'stage_5' || stageId === 'stage_6') {
      return { ...node, images: resolveProcessImagesForStage(node, evidenceItems) }
    }
    return node
  })
}

function sanitizeEvidenceItemsPayload(items) {
  return (items || [])
    .filter((item) => item && item.id && DOCUMENT_TYPES[item.id])
    .map((item) => {
      const def = DOCUMENT_TYPES[item.id]
      return {
        id: def.id,
        category: EVIDENCE_CATEGORY.DOCUMENT,
        type: def.id,
        stageId: def.stageId,
        label: def.label,
        strength: item.strength || def.strength,
        images: normalizeImageList(item.images),
      }
    })
}

function collectDocumentImagesByStage(evidenceItems) {
  const map = {}
  ;(evidenceItems || []).forEach((item) => {
    if (!item || item.category !== EVIDENCE_CATEGORY.DOCUMENT) return
    const stageId = item.stageId
    if (!stageId) return
    if (!map[stageId]) map[stageId] = []
    normalizeImageList(item.images).forEach((url) => {
      if (!map[stageId].includes(url)) map[stageId].push(url)
    })
  })
  return map
}

/**
 * 将 evidence 分槽图合并进 nodes，保留节点内非单据类过程图。
 */
function mergeEvidenceIntoNodes(nodes, evidenceItems) {
  const docImagesByStage = collectDocumentImagesByStage(evidenceItems)
  const documentStageIds = new Set(
    Object.values(DOCUMENT_TYPES).map((d) => d.stageId),
  )

  return (nodes || []).map((node) => {
    const stageId = node.id || node.nodeId
    const docImages = docImagesByStage[stageId] || []
    if (!documentStageIds.has(stageId) || !docImages.length) {
      return { ...node, images: normalizeImageList(node.images) }
    }
    const existing = normalizeImageList(node.images)
    const docSet = new Set(docImages)
    const processOnly = existing.filter((url) => !docSet.has(url))
    return {
      ...node,
      images: [...docImages, ...processOnly],
    }
  })
}

function countDocumentEvidence(evidenceItems) {
  const items = (evidenceItems || []).filter(
    (item) => item && item.category === EVIDENCE_CATEGORY.DOCUMENT,
  )
  const uploaded = items.filter((item) => normalizeImageList(item.images).length > 0).length
  return { uploaded, total: items.length }
}

module.exports = {
  buildDocumentEvidenceCatalog,
  hydrateEvidenceItems,
  filterEvidenceByStage,
  resolveProcessImagesForStage,
  applyProcessOnlyNodes,
  sanitizeEvidenceItemsPayload,
  mergeEvidenceIntoNodes,
  countDocumentEvidence,
  normalizeImageList,
}
