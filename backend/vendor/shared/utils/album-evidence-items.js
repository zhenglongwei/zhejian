/**
 * 服务相册 · 结构化 evidenceItems（B-EVID-01 + B-EVID-06 旧件留痕）
 * 商家分槽上传 ↔ 车主检查页单据 presence 同源
 */
const {
  DOCUMENT_TYPES,
  EVIDENCE_CATEGORY,
  EVIDENCE_STRENGTH,
  OLD_PART_TRACE_TYPE,
  OLD_PART_TRACE_LABEL,
  OLD_PART_TRACE_STAGE_ID,
  OLD_PART_TRACE_MAX_COUNT,
  resolveDocumentTypesForTemplate,
  resolveMerchantEvidenceLabel,
  bumpStrengthForAccident,
  templateMatches,
} = require('../constants/album-evidence-guide')

function normalizeImageList(images) {
  return (images || []).map((url) => String(url || '').trim()).filter(Boolean)
}

function isOldPartEvidenceItem(item) {
  if (!item) return false
  if (item.category === EVIDENCE_CATEGORY.OLD_PART) return true
  if (item.type === OLD_PART_TRACE_TYPE) return true
  return String(item.id || '').startsWith('old_part_trace_')
}

function createOldPartTraceKey() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
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
    if (item && item.id && !isOldPartEvidenceItem(item)) savedById[item.id] = item
  })

  const legacyAssigned = {}
  const documentItems = catalog.map((def) => {
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

  const oldPartItems = (savedItems || [])
    .filter(isOldPartEvidenceItem)
    .map((item) => sanitizeOldPartEvidenceItem(item))
    .filter(Boolean)

  return [...documentItems, ...oldPartItems]
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
  return (evidenceItems || []).filter(
    (item) =>
      item &&
      item.stageId === stageId &&
      item.category === EVIDENCE_CATEGORY.DOCUMENT,
  )
}

function resolveProcessImagesForStage(node, evidenceItems) {
  const stageId = (node && (node.id || node.nodeId)) || ''
  const docSet = new Set()
  filterEvidenceByStage(evidenceItems, stageId).forEach((item) => {
    normalizeImageList(item.images).forEach((url) => docSet.add(url))
  })
  ;(evidenceItems || []).filter(isOldPartEvidenceItem).forEach((item) => {
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

function sanitizeOldPartEvidenceItem(item, validPlanPartIds) {
  if (!item) return null
  const images = normalizeImageList(item.images).slice(0, 1)
  if (!images.length) return null

  const rawKey = String(item.id || '').replace(/^old_part_trace_/, '').trim()
  const traceKey = rawKey || createOldPartTraceKey()
  let planPartId = String(item.planPartId || item.linkKey || '').trim()
  if (validPlanPartIds && planPartId && !validPlanPartIds.has(planPartId)) {
    planPartId = ''
  }

  return {
    id: `old_part_trace_${traceKey}`,
    type: OLD_PART_TRACE_TYPE,
    category: EVIDENCE_CATEGORY.OLD_PART,
    stageId: OLD_PART_TRACE_STAGE_ID,
    label: OLD_PART_TRACE_LABEL,
    strength: item.strength || EVIDENCE_STRENGTH.RECOMMENDED,
    images,
    planPartId,
    linkKey: planPartId,
  }
}

function sanitizeOldPartEvidenceItems(items, validPlanPartIds) {
  const seen = new Set()
  const next = []
  ;(items || []).forEach((item) => {
    const sanitized = sanitizeOldPartEvidenceItem(item, validPlanPartIds)
    if (!sanitized) return
    if (seen.has(sanitized.id)) return
    seen.add(sanitized.id)
    next.push(sanitized)
  })
  return next.slice(0, OLD_PART_TRACE_MAX_COUNT)
}

function sanitizeEvidenceItemsPayload(items, options = {}) {
  const validPlanPartIds = options.validPlanPartIds
  const documentItems = (items || [])
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
  const oldPartItems = sanitizeOldPartEvidenceItems(
    (items || []).filter(isOldPartEvidenceItem),
    validPlanPartIds,
  )
  return [...documentItems, ...oldPartItems]
}

function extractOldPartTraces(evidenceItems = []) {
  return (evidenceItems || [])
    .filter(isOldPartEvidenceItem)
    .map((item) => {
      const traceKey = String(item.id || '').replace(/^old_part_trace_/, '').trim()
      return {
        traceKey: traceKey || createOldPartTraceKey(),
        images: normalizeImageList(item.images).slice(0, 1),
        planPartId: String(item.planPartId || item.linkKey || '').trim(),
      }
    })
}

function buildOldPartEvidenceItems(traces = [], validPlanPartIds) {
  return sanitizeOldPartEvidenceItems(
    (traces || []).map((row) => {
      const traceKey = String(row.traceKey || createOldPartTraceKey()).trim()
      return {
        id: `old_part_trace_${traceKey}`,
        type: OLD_PART_TRACE_TYPE,
        category: EVIDENCE_CATEGORY.OLD_PART,
        stageId: OLD_PART_TRACE_STAGE_ID,
        label: OLD_PART_TRACE_LABEL,
        images: normalizeImageList(row.images).slice(0, 1),
        planPartId: String(row.planPartId || '').trim(),
        linkKey: String(row.planPartId || '').trim(),
      }
    }),
    validPlanPartIds,
  )
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

function buildValidPlanPartIdSet(planParts = [], parts = []) {
  const ids = new Set()
  ;(planParts || []).forEach((plan) => {
    const id = String(plan.planPartId || plan.linkKey || '').trim()
    if (id) ids.add(id)
  })
  ;(parts || []).forEach((part) => {
    const id = String(part.planPartId || part.linkKey || '').trim()
    if (id) ids.add(id)
  })
  return ids
}

function mergeEvidenceItemsForSave(documentItems, oldPartTraces, validPlanPartIds) {
  const docs = (documentItems || []).filter(
    (item) => item && item.category === EVIDENCE_CATEGORY.DOCUMENT,
  )
  const oldParts = buildOldPartEvidenceItems(oldPartTraces, validPlanPartIds)
  return [...docs, ...oldParts]
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
  isOldPartEvidenceItem,
  extractOldPartTraces,
  buildOldPartEvidenceItems,
  buildValidPlanPartIdSet,
  mergeEvidenceItemsForSave,
  createOldPartTraceKey,
}
