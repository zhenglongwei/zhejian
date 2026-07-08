const { resolveImageSrc } = require('./desensitize-url')
const {
  resolveComparePairRowsFromNodes,
  STAGE_COMPARE_ID,
} = require('./album-compare-stage-images')

const COMPARE_TEMPLATE_IDS = new Set(['body_paint', 'accident'])
const MAX_COMPARE_PAIRS = 6

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

function pushPair(pairs, seen, pair) {
  if (!pair || !pair.beforeUrl || !pair.afterUrl) return
  const key = `${pair.beforeUrl}::${pair.afterUrl}`
  if (seen.has(key)) return
  seen.add(key)
  pairs.push(pair)
}

function buildAlbumComparePairs(nodes = [], options = {}) {
  const templateId = resolveCompareTemplateId(options)
  if (!COMPARE_TEMPLATE_IDS.has(templateId)) return []

  const completeNode = findNode(nodes, STAGE_COMPARE_ID)
  const afterLabel = (completeNode && completeNode.title) || '完工'
  const rows = resolveComparePairRowsFromNodes(nodes)
  const pairs = []
  const seen = new Set()

  rows.slice(0, MAX_COMPARE_PAIRS).forEach((row, index) => {
    if (!row.before || !row.after) return
    const beforeUrl = resolveImageSrc(row.before) || row.before
    const afterUrl = resolveImageSrc(row.after) || row.after
    pushPair(pairs, seen, {
      id: `completion_compare_${index}`,
      title:
        rows.length > 1
          ? `第 ${index + 1} 组 · 维修前 → ${afterLabel}`
          : `维修前 → ${afterLabel}`,
      beforeUrl,
      afterUrl,
      beforeLabel: '维修前',
      afterLabel,
      source: 'completion_compare_rows',
    })
  })

  return pairs
}

function buildAlbumCompareHint(pairs = []) {
  if (!pairs.length) return ''
  const rotateTip = '可旋转手机横屏查看。'
  if (pairs.length > 1) {
    return `${rotateTip}在图片上左右滑动切换各组；拖动中间圆点查看前后差异。`
  }
  return `${rotateTip}拖动中间圆点查看前后差异。`
}

function hasAlbumComparePairs(nodes = [], options = {}) {
  return buildAlbumComparePairs(nodes, options).length > 0
}

module.exports = {
  COMPARE_TEMPLATE_IDS,
  MAX_COMPARE_PAIRS,
  resolveCompareTemplateId,
  buildAlbumComparePairs,
  buildAlbumCompareHint,
  hasAlbumComparePairs,
  resolveComparePairRowsFromNodes,
}
