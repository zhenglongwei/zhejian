/**
 * 钣喷「前后对比」：修复前/后双栏；stage_5 优先仅存修复后，与 stage_2 同序号配对。
 */

const STAGE_ASSESSMENT_ID = 'stage_2'
const STAGE_COMPARE_ID = 'stage_5'

function findNode(nodes, nodeId) {
  return (nodes || []).find((n) => n && (n.id === nodeId || n.nodeId === nodeId))
}

function normalizeList(images = []) {
  return (images || []).map((url) => String(url || '').trim()).filter(Boolean)
}

function arraysEqual(a = [], b = []) {
  if (a.length !== b.length) return false
  return a.every((url, index) => url === b[index])
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

/** 从相册节点解析商家对比双栏数据 */
function resolveCompareColumnsFromNodes(nodes = []) {
  const stage2 = findNode(nodes, STAGE_ASSESSMENT_ID)
  const stage5 = findNode(nodes, STAGE_COMPARE_ID)
  const assessment = normalizeList(stage2 && stage2.images)
  const stored = normalizeList(stage5 && stage5.images)

  if (!stored.length) {
    return {
      beforeImages: assessment.slice(),
      afterImages: [],
      storageMode: 'after_only',
    }
  }

  // 修复后专用：stage_5 张数 ≤ 损伤评估 → 同序号 after（仅真实 URL，不补空位）
  if (assessment.length > 0 && stored.length <= assessment.length) {
    const partialAfterOnly =
      stored.length < assessment.length || stored.length % 2 !== 0
    if (partialAfterOnly || stored.length === assessment.length) {
      return {
        beforeImages: assessment.slice(),
        afterImages: stored.slice(),
        storageMode: 'after_only',
      }
    }
  }

  // 交错存储 [前,后,前,后…]
  if (stored.length >= 2 && stored.length % 2 === 0) {
    const { beforeImages, afterImages } = splitInterleavedImages(stored)
    const hasAfter = afterImages.some(Boolean)
    if (hasAfter) {
      return {
        beforeImages: beforeImages.length ? beforeImages : assessment.slice(),
        afterImages: afterImages.filter(Boolean),
        storageMode: 'interleaved',
      }
    }
  }

  if (assessment.length) {
    const count = Math.min(assessment.length, stored.length)
    return {
      beforeImages: assessment.slice(0, count),
      afterImages: stored.slice(0, count),
      storageMode: 'after_only',
    }
  }

  const split = splitInterleavedImages(stored)
  return {
    beforeImages: split.beforeImages,
    afterImages: split.afterImages.filter(Boolean),
    storageMode: 'interleaved',
  }
}

function mergeCompareColumnsToStage5(beforeImages = [], afterImages = [], assessmentImages = []) {
  const before = normalizeList(beforeImages)
  const after = normalizeList(afterImages)
  const assessment = normalizeList(assessmentImages)

  if (!before.length && !after.length) return []

  if (after.length && arraysEqual(before, assessment)) {
    return after.slice()
  }

  const merged = []
  const maxLen = Math.max(before.length, after.length)
  for (let i = 0; i < maxLen; i += 1) {
    if (before[i]) merged.push(before[i])
    if (after[i]) merged.push(after[i])
  }
  return merged
}

function buildComparePairPreview(beforeImages = [], afterImages = []) {
  const maxLen = Math.max(beforeImages.length, afterImages.length, 0)
  if (!maxLen) {
    return [{ index: 0, label: '第 1 组', beforeUrl: '', afterUrl: '', complete: false }]
  }
  return Array.from({ length: maxLen }, (_, index) => {
    const beforeUrl = beforeImages[index] || ''
    const afterUrl = afterImages[index] || ''
    return {
      index,
      label: `第 ${index + 1} 组`,
      beforeUrl,
      afterUrl,
      complete: Boolean(beforeUrl && afterUrl),
    }
  })
}

function syncBeforeFromAssessment(beforeImages = [], afterImages = [], assessmentImages = []) {
  const assessment = normalizeList(assessmentImages)
  const after = normalizeList(afterImages)
  if (!assessment.length) {
    return {
      beforeImages: normalizeList(beforeImages),
      afterImages: after,
    }
  }
  return {
    beforeImages: assessment.slice(),
    afterImages: after.slice(0, assessment.length),
  }
}

function applyCompareColumnsToNodes(nodes = [], beforeImages = [], afterImages = [], assessmentImages = []) {
  const list = (nodes || []).map((n) => ({ ...n }))
  const idx = list.findIndex((n) => n.id === STAGE_COMPARE_ID)
  if (idx < 0) return list
  list[idx] = {
    ...list[idx],
    images: mergeCompareColumnsToStage5(beforeImages, afterImages, assessmentImages),
  }
  return list
}

module.exports = {
  STAGE_ASSESSMENT_ID,
  STAGE_COMPARE_ID,
  resolveCompareColumnsFromNodes,
  mergeCompareColumnsToStage5,
  buildComparePairPreview,
  syncBeforeFromAssessment,
  applyCompareColumnsToNodes,
  splitInterleavedImages,
}
