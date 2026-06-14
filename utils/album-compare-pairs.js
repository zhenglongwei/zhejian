const { resolveImageSrcList } = require('./desensitize-url')

const COMPARE_TEMPLATE_IDS = new Set(['body_paint', 'accident'])

const STAGE_BEFORE = 'stage_1'
const STAGE_COMPARE = 'stage_5'
const STAGE_AFTER = 'stage_6'

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
 * 钣喷/事故车：stage_1 ↔ stage_6；stage_5 双图亦可成对。
 * @returns {Array<{ id, title, beforeUrl, afterUrl, beforeLabel, afterLabel }>}
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
    const count = Math.min(beforeImages.length, afterImages.length, 3)
    for (let i = 0; i < count; i += 1) {
      pushPair(pairs, seen, {
        id: `stage1_stage6_${i}`,
        title: count > 1 ? `${beforeLabel} · 对比 ${i + 1}` : `${beforeLabel} → ${afterLabel}`,
        beforeUrl: beforeImages[i],
        afterUrl: afterImages[i],
        beforeLabel,
        afterLabel,
      })
    }
  }

  const compareImages = nodeImages(compareNode)
  if (compareImages.length >= 2) {
    pushPair(pairs, seen, {
      id: 'stage5_pair',
      title: (compareNode && compareNode.title) || '前后对比',
      beforeUrl: compareImages[0],
      afterUrl: compareImages[1],
      beforeLabel: '对比前',
      afterLabel: '对比后',
    })
  }

  return pairs
}

function hasAlbumComparePairs(nodes = [], options = {}) {
  return buildAlbumComparePairs(nodes, options).length > 0
}

module.exports = {
  COMPARE_TEMPLATE_IDS,
  resolveCompareTemplateId,
  buildAlbumComparePairs,
  hasAlbumComparePairs,
}
