/**
 * 钣喷「前后对比」节点：修复前/后分列，存储仍为交错 [前1,后1,前2,后2…]
 */

function findNode(nodes, nodeId) {
  return (nodes || []).find((n) => n && (n.id === nodeId || n.nodeId === nodeId))
}

function splitCompareStageImages(images = []) {
  const list = (images || []).filter(Boolean)
  const beforeImages = []
  const afterImages = []
  for (let i = 0; i < list.length; i += 2) {
    beforeImages.push(list[i])
    afterImages.push(list[i + 1] || '')
  }
  return { beforeImages, afterImages }
}

function mergeComparePairRows(pairs = []) {
  const merged = []
  ;(pairs || []).forEach((pair) => {
    const before = pair && pair.beforeUrl ? String(pair.beforeUrl).trim() : ''
    const after = pair && pair.afterUrl ? String(pair.afterUrl).trim() : ''
    if (before) merged.push(before)
    if (after) merged.push(after)
  })
  return merged
}

function buildComparePairRows(beforeImages = [], afterImages = []) {
  const maxLen = Math.max(beforeImages.length, afterImages.length, 0)
  if (!maxLen) {
    return [
      {
        id: 'pair_0',
        label: '第 1 组',
        beforeUrl: '',
        afterUrl: '',
      },
    ]
  }
  return Array.from({ length: maxLen }, (_, index) => ({
    id: `pair_${index}`,
    label: `第 ${index + 1} 组`,
    beforeUrl: beforeImages[index] || '',
    afterUrl: afterImages[index] || '',
  }))
}

function buildComparePairRowsFromNodes(nodes = []) {
  const stage5 = findNode(nodes, 'stage_5')
  const stage2 = findNode(nodes, 'stage_2')
  const stored = stage5 && Array.isArray(stage5.images) ? stage5.images : []
  const { beforeImages, afterImages } = splitCompareStageImages(stored)
  if (beforeImages.length || afterImages.some(Boolean)) {
    return buildComparePairRows(beforeImages, afterImages)
  }
  const assessment = (stage2 && stage2.images) || []
  if (assessment.length) {
    return assessment.map((url, index) => ({
      id: `pair_${index}`,
      label: `第 ${index + 1} 组`,
      beforeUrl: url,
      afterUrl: '',
    }))
  }
  return buildComparePairRows([], [])
}

function syncComparePairsFromAssessment(pairs = [], assessmentImages = []) {
  const assessment = (assessmentImages || []).filter(Boolean)
  if (!assessment.length) return pairs
  const afterByIndex = {}
  ;(pairs || []).forEach((pair, index) => {
    afterByIndex[index] = (pair && pair.afterUrl) || ''
  })
  return assessment.map((url, index) => ({
    id: `pair_${index}`,
    label: `第 ${index + 1} 组`,
    beforeUrl: url,
    afterUrl: afterByIndex[index] || '',
  }))
}

function applyComparePairsToNodes(nodes = [], pairs = []) {
  const list = (nodes || []).map((n) => ({ ...n }))
  const idx = list.findIndex((n) => n.id === 'stage_5')
  if (idx < 0) return list
  list[idx] = {
    ...list[idx],
    images: mergeComparePairRows(pairs),
  }
  return list
}

module.exports = {
  splitCompareStageImages,
  mergeComparePairRows,
  buildComparePairRows,
  buildComparePairRowsFromNodes,
  syncComparePairsFromAssessment,
  applyComparePairsToNodes,
}
