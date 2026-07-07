/**
 * 完工节点 · 逐行前后对比
 * comparePairRows: [{ before, after }] — before 可空；after 写入 node.images 供车主浏览
 */

const STAGE_ASSESSMENT_ID = 'stage_2'
const STAGE_INTAKE_ID = 'stage_1'
const STAGE_COMPARE_ID = 'stage_6'
const LEGACY_COMPARE_STAGE_ID = 'stage_5'
const MAX_COMPARE_PAIR_ROWS = 6

function findNode(nodes, nodeId) {
  return (nodes || []).find((n) => n && (n.id === nodeId || n.nodeId === nodeId))
}

function normalizeList(images = []) {
  return (images || []).map((url) => String(url || '').trim()).filter(Boolean)
}

function normalizeComparePairRows(rows = []) {
  if (!Array.isArray(rows)) return []
  return rows
    .slice(0, MAX_COMPARE_PAIR_ROWS)
    .map((row) => ({
      before: String((row && row.before) || '').trim(),
      after: String((row && row.after) || '').trim(),
    }))
    .filter((row) => row.before || row.after)
}

function splitInterleavedImages(images = []) {
  const list = normalizeList(images)
  const beforeImages = []
  const afterImages = []
  for (let i = 0; i < list.length; i += 2) {
    beforeImages.push(list[i])
    afterImages.push(list[i + 1] || '')
  }
  return { beforeImages, afterImages }
}

function rowsFromBeforeAfterLists(beforeImages = [], afterImages = []) {
  const maxLen = Math.max(beforeImages.length, afterImages.length, 0)
  const rows = []
  for (let i = 0; i < maxLen; i += 1) {
    const before = String(beforeImages[i] || '').trim()
    const after = String(afterImages[i] || '').trim()
    if (!before && !after) continue
    rows.push({ before, after })
  }
  return normalizeComparePairRows(rows)
}

function readStoredComparePairRows(node = {}) {
  const raw = node.comparePairRows
  if (Array.isArray(raw) && raw.length) {
    return normalizeComparePairRows(raw)
  }
  return []
}

function migrateLegacyCompareRows(nodes = []) {
  const stored = readStoredComparePairRows(findNode(nodes, STAGE_COMPARE_ID) || {})
  if (stored.length) return stored

  const completeNode = findNode(nodes, STAGE_COMPARE_ID)
  const legacyNode = findNode(nodes, LEGACY_COMPARE_STAGE_ID)
  const completeImages = normalizeList(completeNode && completeNode.images)
  const legacyImages = normalizeList(legacyNode && legacyNode.images)
  const storedImages = completeImages.length ? completeImages : legacyImages

  if (!storedImages.length) return []

  const assessment = normalizeList(findNode(nodes, STAGE_ASSESSMENT_ID)?.images)
  const intake = normalizeList(findNode(nodes, STAGE_INTAKE_ID)?.images)

  if (storedImages.length >= 2 && storedImages.length % 2 === 0) {
    const { beforeImages, afterImages } = splitInterleavedImages(storedImages)
    if (afterImages.some(Boolean)) {
      return rowsFromBeforeAfterLists(
        beforeImages.length ? beforeImages : assessment,
        afterImages,
      )
    }
  }

  if (assessment.length && storedImages.length) {
    if (storedImages.length <= assessment.length) {
      return rowsFromBeforeAfterLists(assessment.slice(0, storedImages.length), storedImages)
    }
  }

  if (intake.length && completeImages.length) {
    const count = Math.min(intake.length, completeImages.length, MAX_COMPARE_PAIR_ROWS)
    return rowsFromBeforeAfterLists(
      intake.slice(0, count),
      completeImages.slice(0, count),
    )
  }

  return storedImages.map((after) => ({ before: '', after }))
}

function resolveComparePairRowsFromNodes(nodes = []) {
  return migrateLegacyCompareRows(nodes)
}

function afterImagesFromRows(rows = []) {
  return normalizeComparePairRows(rows)
    .map((row) => row.after)
    .filter(Boolean)
}

function buildComparePairPreviewFromRows(rows = []) {
  const list = normalizeComparePairRows(rows)
  if (!list.length) {
    return [{ index: 0, label: '第 1 组', beforeUrl: '', afterUrl: '', complete: false }]
  }
  return list.map((row, index) => ({
    index,
    label: `第 ${index + 1} 组`,
    beforeUrl: row.before || '',
    afterUrl: row.after || '',
    complete: Boolean(row.before && row.after),
  }))
}

function applyComparePairRowsToNodes(nodes = [], rows = []) {
  const list = (nodes || []).map((n) => ({ ...n }))
  const idx = list.findIndex((n) => n.id === STAGE_COMPARE_ID || n.nodeId === STAGE_COMPARE_ID)
  if (idx < 0) return list
  const normalized = normalizeComparePairRows(rows)
  list[idx] = {
    ...list[idx],
    comparePairRows: normalized,
    images: afterImagesFromRows(normalized),
  }
  return list
}

function syncBeforeFromAssessmentRows(rows = [], assessmentImages = []) {
  const assessment = normalizeList(assessmentImages)
  const current = normalizeComparePairRows(rows)
  if (!assessment.length) {
    return current
  }
  const maxLen = Math.max(current.length, assessment.length, 1)
  const next = []
  for (let i = 0; i < Math.min(maxLen, MAX_COMPARE_PAIR_ROWS); i += 1) {
    const existing = current[i] || { before: '', after: '' }
    next.push({
      before: assessment[i] || existing.before || '',
      after: existing.after || '',
    })
  }
  return normalizeComparePairRows(next)
}

/** @deprecated 兼容旧调用 */
function resolveCompareColumnsFromNodes(nodes = []) {
  const rows = resolveComparePairRowsFromNodes(nodes)
  return {
    beforeImages: rows.map((row) => row.before),
    afterImages: rows.map((row) => row.after),
    storageMode: 'rows',
  }
}

function applyCompareColumnsToNodes(nodes = [], beforeImages = [], afterImages = [], assessmentImages = []) {
  let rows = rowsFromBeforeAfterLists(beforeImages, afterImages)
  if (assessmentImages && assessmentImages.length) {
    rows = syncBeforeFromAssessmentRows(rows, assessmentImages)
  }
  return applyComparePairRowsToNodes(nodes, rows)
}

function buildComparePairPreview(beforeImages = [], afterImages = []) {
  return buildComparePairPreviewFromRows(rowsFromBeforeAfterLists(beforeImages, afterImages))
}

function syncBeforeFromAssessment(beforeImages = [], afterImages = [], assessmentImages = []) {
  const rows = syncBeforeFromAssessmentRows(
    rowsFromBeforeAfterLists(beforeImages, afterImages),
    assessmentImages,
  )
  return {
    beforeImages: rows.map((row) => row.before),
    afterImages: rows.map((row) => row.after),
  }
}

module.exports = {
  STAGE_ASSESSMENT_ID,
  STAGE_INTAKE_ID,
  STAGE_COMPARE_ID,
  LEGACY_COMPARE_STAGE_ID,
  MAX_COMPARE_PAIR_ROWS,
  normalizeComparePairRows,
  resolveComparePairRowsFromNodes,
  applyComparePairRowsToNodes,
  buildComparePairPreviewFromRows,
  buildComparePairPreview,
  syncBeforeFromAssessmentRows,
  syncBeforeFromAssessment,
  resolveCompareColumnsFromNodes,
  applyCompareColumnsToNodes,
  afterImagesFromRows,
  splitInterleavedImages,
}
