const { resolveImageSrcList } = require('./desensitize-url')

const COMPARE_TEMPLATE_IDS = new Set(['body_paint', 'accident'])

const STAGE_BEFORE = 'stage_1'
const STAGE_COMPARE = 'stage_5'
const STAGE_AFTER = 'stage_6'
const MAX_CROSS_STAGE_PAIRS = 6

function resolveCompareTemplateId(detail = {}) {
  const templateId = String(detail.templateId || '').trim()
  if (COMPARE_TEMPLATE_IDS.has(templateId)) return templateId

  const hint = `${detail.serviceName || ''}${detail.templateName || ''}`
  if (/钣喷|喷漆|钣金|补漆|划痕/.test(hint)) return 'body_paint'
  if (/事故/.test(hint)) return 'accident'
  return ''
}

function findNode(nodes, nodeId) {
  return (nodes || []).find((node) => node && (node.id === nodeId || node.nodeId === nodeId))
}

function nodeImages(node) {
  const raw = (node && node.images) || []
  const resolved = resolveImageSrcList(raw)
  if (resolved.length) return resolved
  return raw.map((url) => String(url || '').trim()).filter(Boolean)
}

function pushPair(pairs, seen, pair) {
  if (!pair || !pair.beforeUrl || !pair.afterUrl) return
  const key = `${pair.beforeUrl}::${pair.afterUrl}`
  if (seen.has(key)) return
  seen.add(key)
  pairs.push(pair)
}

/**
 * 钣喷/事故车：
 * - stage_1 ↔ stage_6 按序号成对（最多 6 组）；
 * - stage_5 按 1-2、3-4… 成对（钣喷「前后对比」节点）。
 */
function buildAlbumComparePairs(nodes = [], options = {}) {
  const templateId = resolveCompareTemplateId(options)
  if (!COMPARE_TEMPLATE_IDS.has(templateId)) return []

  const list = nodes || []
  const beforeNode = findNode(list, STAGE_BEFORE)
  const afterNode = findNode(list, STAGE_AFTER)
  const compareNode = findNode(list, STAGE_COMPARE)
  const pairs = []
  const seen = new Set()

  const beforeImages = nodeImages(beforeNode)
  const afterImages = nodeImages(afterNode)
  const beforeLabel = (beforeNode && beforeNode.title) || '维修前'
  const afterLabel = (afterNode && afterNode.title) || '完工后'

  if (beforeImages.length && afterImages.length) {
    const count = Math.min(
      beforeImages.length,
      afterImages.length,
      MAX_CROSS_STAGE_PAIRS,
    )
    for (let i = 0; i < count; i += 1) {
      pushPair(pairs, seen, {
        id: `stage1_stage6_${i}`,
        title: count > 1 ? `第 ${i + 1} 处 · ${beforeLabel} → ${afterLabel}` : `${beforeLabel} → ${afterLabel}`,
        beforeUrl: beforeImages[i],
        afterUrl: afterImages[i],
        beforeLabel,
        afterLabel,
        source: 'cross_stage',
      })
    }
  }

  const compareImages = nodeImages(compareNode)
  if (compareImages.length >= 2 && templateId === 'body_paint') {
    const pairCount = Math.floor(compareImages.length / 2)
    for (let i = 0; i < pairCount; i += 1) {
      const beforeIdx = i * 2
      const afterIdx = beforeIdx + 1
      pushPair(pairs, seen, {
        id: `stage5_pair_${i}`,
        title:
          pairCount > 1
            ? `${(compareNode && compareNode.title) || '前后对比'} · 第 ${i + 1} 组`
            : (compareNode && compareNode.title) || '前后对比',
        beforeUrl: compareImages[beforeIdx],
        afterUrl: compareImages[afterIdx],
        beforeLabel: '修复前',
        afterLabel: '修复后',
        source: 'stage5',
      })
    }
  }

  return pairs
}

function buildAlbumCompareHint(pairs = [], options = {}) {
  if (!pairs.length) return ''
  const crossCount = pairs.filter((p) => p.source === 'cross_stage').length
  const stage5Count = pairs.filter((p) => p.source === 'stage5').length
  if (crossCount > 1 || stage5Count > 0) {
    return '左右切换查看各损伤点；拖动中线对比。若错位请联系门店重拍。'
  }
  return '左右拖动中线查看差异。'
}

function hasAlbumComparePairs(nodes = [], options = {}) {
  return buildAlbumComparePairs(nodes, options).length > 0
}

module.exports = {
  COMPARE_TEMPLATE_IDS,
  MAX_CROSS_STAGE_PAIRS,
  resolveCompareTemplateId,
  buildAlbumComparePairs,
  buildAlbumCompareHint,
  hasAlbumComparePairs,
}
