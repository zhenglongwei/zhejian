/**
 * 服务相册 · 结构化 evidenceItems（B-EVID-01 + B-EVID-06 旧件留痕 + B-EVID-07 质保）
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
  WARRANTY_DOCUMENT_ID,
  WARRANTY_FIELD_MAX_LEN,
  SETTLEMENT_DOCUMENT_ID,
  RETIRED_DOCUMENT_IDS,
  resolveDocumentTypesForTemplate,
  resolveMerchantEvidenceLabel,
  bumpStrengthForAccident,
  templateMatches,
} = require('../constants/album-evidence-guide')

function normalizeImageList(images) {
  return (images || [])
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim()
      if (entry && typeof entry === 'object') {
        return String(entry.url || entry.rawUrl || entry.src || '').trim()
      }
      return ''
    })
    .filter(Boolean)
}

/** 过程图条目：保留 caption + checklistItemKey（挂检查项） */
function normalizeImageEntries(images) {
  return (images || [])
    .map((entry) => {
      if (typeof entry === 'string') {
        const url = entry.trim()
        return url ? { url, caption: '', checklistItemKey: '' } : null
      }
      if (!entry || typeof entry !== 'object') return null
      const url = String(entry.url || entry.rawUrl || entry.src || '').trim()
      if (!url) return null
      return {
        url,
        caption: String(entry.caption || '').trim().slice(0, 500),
        checklistItemKey: String(entry.checklistItemKey || entry.itemKey || '')
          .trim()
          .slice(0, 64),
      }
    })
    .filter(Boolean)
}

function normalizeWarrantyText(value, maxLen) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

function extractWarrantyFields(item = {}) {
  return {
    duration: normalizeWarrantyText(item.duration, WARRANTY_FIELD_MAX_LEN.duration),
    scope: normalizeWarrantyText(item.scope, WARRANTY_FIELD_MAX_LEN.scope),
    note: normalizeWarrantyText(item.note, WARRANTY_FIELD_MAX_LEN.note),
  }
}

/** 读侧一段总说明：新数据用 note；旧三栏自动拼接 */
function formatWarrantyCommitmentText(item = {}) {
  const fields = extractWarrantyFields(item)
  const parts = []
  if (fields.duration) parts.push(fields.duration)
  if (fields.scope) parts.push(fields.scope)
  if (fields.note) parts.push(fields.note)
  return parts.join('；').slice(0, WARRANTY_FIELD_MAX_LEN.note)
}

/** 商家编辑：合并旧三栏进 note，保存时只写 note */
function collapseWarrantyFieldsForEdit(item = {}) {
  const unified = formatWarrantyCommitmentText(item)
  return {
    duration: '',
    scope: '',
    note: unified,
  }
}

function buildWarrantyFieldsForSave(fields = {}) {
  const note = normalizeWarrantyText(
    fields.note != null ? fields.note : formatWarrantyCommitmentText(fields),
    WARRANTY_FIELD_MAX_LEN.note,
  )
  return {
    duration: '',
    scope: '',
    note,
  }
}

function hasWarrantyTextFields(item = {}) {
  return Boolean(formatWarrantyCommitmentText(item))
}

function hasWarrantyCommitment(item = {}) {
  return normalizeImageList(item.images).length > 0 || hasWarrantyTextFields(item)
}

function isRetiredDocumentItem(item) {
  if (!item) return false
  const id = String(item.id || item.type || '').trim()
  if (!id) return false
  // 结算单已下线；勿依赖可能未完成导出的常量数组（循环依赖时会 undefined.includes）
  if (id === 'settlement') return true
  if (SETTLEMENT_DOCUMENT_ID && id === SETTLEMENT_DOCUMENT_ID) return true
  if (Array.isArray(RETIRED_DOCUMENT_IDS) && RETIRED_DOCUMENT_IDS.includes(id)) return true
  return false
}

function stripRetiredDocumentItems(items = []) {
  return (items || []).filter((item) => !isRetiredDocumentItem(item))
}

/** 保存时保留库内已下线结算单存档，不进正文目录 */
function preserveRetiredDocumentArchive(existingItems = [], nextItems = []) {
  const next = stripRetiredDocumentItems(nextItems)
  const archived = (existingItems || []).filter(
    (item) => isRetiredDocumentItem(item) && normalizeImageList(item.images).length > 0,
  )
  if (!archived.length) return next
  return [...next, ...archived]
}

function findWarrantyEvidenceItem(evidenceItems = []) {
  return (
    (evidenceItems || []).find(
      (item) => item && (item.id === WARRANTY_DOCUMENT_ID || item.type === WARRANTY_DOCUMENT_ID),
    ) || null
  )
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

/**
 * 各单据槽互不混同：质保图不得出现在结算单，反之亦然。
 * 用于纠正历史「阶段六整节点图塞进结算单」脏数据。
 */
function scrubCrossSlotDocumentImages(documentItems = []) {
  const warrantyUrls = new Set()
  ;(documentItems || []).forEach((item) => {
    if (!item || item.id !== WARRANTY_DOCUMENT_ID) return
    normalizeImageList(item.images).forEach((url) => warrantyUrls.add(url))
  })
  if (!warrantyUrls.size) return documentItems || []

  return (documentItems || []).map((item) => {
    if (!item || item.id !== 'settlement') return item
    const images = normalizeImageList(item.images).filter((url) => !warrantyUrls.has(url))
    if (images.length === normalizeImageList(item.images).length) return item
    return { ...item, images }
  })
}

function hydrateEvidenceItems({ templateId = '', savedItems = [], nodes = [] } = {}) {
  const catalog = buildDocumentEvidenceCatalog(templateId)
  const savedById = {}
  ;(savedItems || []).forEach((item) => {
    if (item && item.id && !isOldPartEvidenceItem(item)) savedById[item.id] = item
  })

  // 已明确挂在某单据槽的图，不得再被其它槽的「旧节点兼容」逻辑吞并
  const claimedUrls = new Set()
  Object.keys(savedById).forEach((id) => {
    normalizeImageList(savedById[id].images).forEach((url) => claimedUrls.add(url))
  })

  const legacyAssigned = {}
  const documentItems = catalog.map((def) => {
    const saved = savedById[def.id] || {}
    let images =
      def.id === WARRANTY_DOCUMENT_ID
        ? normalizeImageEntries(saved.images)
        : normalizeImageList(saved.images)
    if (!images.length) {
      const legacySlot = defaultLegacySlotForStage(def.stageId, templateId)
      if (legacySlot && def.id === legacySlot) {
        const legacyKey = def.stageId
        if (!legacyAssigned[legacyKey]) {
          legacyAssigned[legacyKey] = findNodeImages(nodes, legacyKey).filter(
            (url) => !claimedUrls.has(url),
          )
        }
        const legacyPool = legacyAssigned[legacyKey] || []
        if (legacyPool.length) {
          images =
            def.id === WARRANTY_DOCUMENT_ID
              ? legacyPool.map((url) => ({ url, caption: '', checklistItemKey: '' }))
              : legacyPool.slice()
        }
      }
    }
    const base = {
      ...def,
      images,
      enableCaption: def.id === WARRANTY_DOCUMENT_ID,
    }
    if (def.id === WARRANTY_DOCUMENT_ID) {
      return {
        ...base,
        ...collapseWarrantyFieldsForEdit(saved),
      }
    }
    return base
  })

  const oldPartItems = (savedItems || [])
    .filter(isOldPartEvidenceItem)
    .map((item) => sanitizeOldPartEvidenceItem(item))
    .filter(Boolean)

  return [...scrubCrossSlotDocumentImages(documentItems), ...oldPartItems]
}

/**
 * 仅单槽阶段可做「节点旧图 → 单据槽」兼容；阶段六仅质保，禁止整包塞槽。
 */
function defaultLegacySlotForStage(stageId, templateId) {
  if (stageId === 'stage_1' || stageId === 'stage_2') {
    return templateMatches(DOCUMENT_TYPES.loss_assessment, templateId)
      ? 'loss_assessment'
      : ''
  }
  if (stageId === 'stage_3') {
    // 历史相册：方案节点旧图不再映射到已废止的报价单槽
    return ''
  }
  if (stageId === 'stage_5') return ''
  if (stageId === 'stage_6') return ''
  return ''
}

function filterEvidenceByStage(evidenceItems, stageId) {
  return (evidenceItems || []).filter(
    (item) =>
      item &&
      item.stageId === stageId &&
      item.category === EVIDENCE_CATEGORY.DOCUMENT &&
      !isRetiredDocumentItem(item),
  )
}

function resolveProcessImagesForStage(node, evidenceItems) {
  const stageId = (node && (node.id || node.nodeId)) || ''
  const docSet = new Set()
  filterEvidenceByStage(evidenceItems, stageId).forEach((item) => {
    normalizeImageList(item.images).forEach((url) => docSet.add(url))
  })
  ;(evidenceItems || []).forEach((item) => {
    if (isOldPartEvidenceItem(item) || isRetiredDocumentItem(item)) {
      normalizeImageList(item.images).forEach((url) => docSet.add(url))
    }
  })
  return normalizeImageEntries(node && node.images).filter((entry) => !docSet.has(entry.url))
}

function applyProcessOnlyNodes(nodes, evidenceItems) {
  return (nodes || []).map((node) => {
    const stageId = node.id || node.nodeId
    if (!stageId || stageId === 'stage_3' || stageId === 'stage_5' || stageId === 'stage_6') {
      return { ...node, images: resolveProcessImagesForStage(node, evidenceItems) }
    }
    return {
      ...node,
      images: normalizeImageEntries(node.images),
    }
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
  const documentItems = scrubCrossSlotDocumentImages(
    (items || [])
      .filter((item) => item && item.id && DOCUMENT_TYPES[item.id] && !isRetiredDocumentItem(item))
      .map((item) => {
        const def = DOCUMENT_TYPES[item.id]
        const row = {
          id: def.id,
          category: EVIDENCE_CATEGORY.DOCUMENT,
          type: def.id,
          stageId: def.stageId,
          label: def.label,
          strength: item.strength || def.strength,
          images:
            def.id === WARRANTY_DOCUMENT_ID
              ? normalizeImageEntries(item.images)
              : normalizeImageList(item.images),
        }
        if (def.id === WARRANTY_DOCUMENT_ID) {
          Object.assign(row, buildWarrantyFieldsForSave(item))
        }
        return row
      }),
  )
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

function collectDocumentImageEntriesByStage(evidenceItems) {
  const map = {}
  ;(evidenceItems || []).forEach((item) => {
    if (!item || item.category !== EVIDENCE_CATEGORY.DOCUMENT) return
    if (isRetiredDocumentItem(item)) return
    const stageId = item.stageId
    if (!stageId) return
    if (!map[stageId]) map[stageId] = []
    const entries =
      item.id === WARRANTY_DOCUMENT_ID || item.type === WARRANTY_DOCUMENT_ID
        ? normalizeImageEntries(item.images)
        : normalizeImageList(item.images).map((url) => ({
            url,
            caption: '',
            checklistItemKey: '',
          }))
    entries.forEach((entry) => {
      if (!map[stageId].some((row) => row.url === entry.url)) {
        map[stageId].push(entry)
      }
    })
  })
  return map
}

/**
 * 将 evidence 分槽图合并进 nodes，保留节点内非单据类过程图（含 caption）。
 */
function mergeEvidenceIntoNodes(nodes, evidenceItems) {
  const docEntriesByStage = collectDocumentImageEntriesByStage(evidenceItems)
  const documentStageIds = new Set(
    Object.values(DOCUMENT_TYPES).map((d) => d.stageId),
  )

  return (nodes || []).map((node) => {
    const stageId = node.id || node.nodeId
    const docEntries = docEntriesByStage[stageId] || []
    const processEntries = normalizeImageEntries(node.images)
    if (!documentStageIds.has(stageId) || !docEntries.length) {
      return { ...node, images: processEntries }
    }
    const docSet = new Set(docEntries.map((entry) => entry.url))
    const processOnly = processEntries.filter((entry) => !docSet.has(entry.url))
    return {
      ...node,
      images: [...docEntries, ...processOnly],
    }
  })
}

function countDocumentEvidence(evidenceItems) {
  const items = (evidenceItems || []).filter(
    (item) =>
      item &&
      item.category === EVIDENCE_CATEGORY.DOCUMENT &&
      !isRetiredDocumentItem(item),
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
  const docs = stripRetiredDocumentItems(documentItems || []).filter(
    (item) => item && item.category === EVIDENCE_CATEGORY.DOCUMENT,
  )
  const oldParts = buildOldPartEvidenceItems(oldPartTraces, validPlanPartIds)
  return [...docs, ...oldParts]
}

function patchWarrantyFieldsInEvidence(evidenceItems = [], fields = {}) {
  const nextFields = buildWarrantyFieldsForSave(fields)
  let found = false
  const next = (evidenceItems || []).map((item) => {
    if (!item || item.id !== WARRANTY_DOCUMENT_ID) return item
    found = true
    return {
      ...item,
      ...nextFields,
    }
  })
  if (found) return next
  const def = DOCUMENT_TYPES[WARRANTY_DOCUMENT_ID]
  if (!def) return next
  return [
    ...next,
    {
      id: def.id,
      category: EVIDENCE_CATEGORY.DOCUMENT,
      type: def.id,
      stageId: def.stageId,
      label: def.label,
      strength: def.strength,
      merchantLabel: resolveMerchantEvidenceLabel(def.strength),
      merchantHint: def.merchantHint || '',
      images: [],
      enableCaption: true,
      ...nextFields,
    },
  ]
}

module.exports = {
  buildDocumentEvidenceCatalog,
  hydrateEvidenceItems,
  scrubCrossSlotDocumentImages,
  filterEvidenceByStage,
  resolveProcessImagesForStage,
  applyProcessOnlyNodes,
  sanitizeEvidenceItemsPayload,
  mergeEvidenceIntoNodes,
  countDocumentEvidence,
  normalizeImageList,
  normalizeImageEntries,
  isOldPartEvidenceItem,
  extractOldPartTraces,
  buildOldPartEvidenceItems,
  buildValidPlanPartIdSet,
  mergeEvidenceItemsForSave,
  createOldPartTraceKey,
  extractWarrantyFields,
  collapseWarrantyFieldsForEdit,
  buildWarrantyFieldsForSave,
  hasWarrantyTextFields,
  hasWarrantyCommitment,
  formatWarrantyCommitmentText,
  findWarrantyEvidenceItem,
  patchWarrantyFieldsInEvidence,
  isRetiredDocumentItem,
  stripRetiredDocumentItems,
  preserveRetiredDocumentArchive,
  WARRANTY_DOCUMENT_ID,
  SETTLEMENT_DOCUMENT_ID,
}
