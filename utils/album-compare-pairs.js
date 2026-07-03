const { resolveImageSrcList } = require('./desensitize-url')
const {
  splitInterleavedImages,
  STAGE_ASSESSMENT_ID,
  STAGE_COMPARE_ID,
} = require('./album-compare-stage-images')

const COMPARE_TEMPLATE_IDS = new Set(['body_paint', 'accident'])

const STAGE_INTAKE = 'stage_1'
const STAGE_COMPLETE = 'stage_6'
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

function resolveBodyPaintCompareColumns(nodes) {
  const assessmentNode = findNode(nodes, STAGE_ASSESSMENT_ID)
  const compareNode = findNode(nodes, STAGE_COMPARE_ID)
  const assessment = nodeImages(assessmentNode)
  const stored = nodeImages(compareNode)

  if (!stored.length && !assessment.length) {
    return { beforeList: [], afterList: [] }
  }

  if (!stored.length) {
    return { beforeList: assessment, afterList: [] }
  }

  if (assessment.length > 0 && stored.length === assessment.length) {
    return { beforeList: assessment, afterList: stored }
  }

  if (stored.length >= 2 && stored.length % 2 === 0) {
    const { beforeImages, afterImages } = splitInterleavedImages(stored)
    const hasPairedAfter = afterImages.some(Boolean)
    if (hasPairedAfter) {
      return {
        beforeList: beforeImages.length ? beforeImages : assessment,
        afterList: afterImages,
      }
    }
  }

  if (assessment.length) {
    const count = Math.min(assessment.length, stored.length)
    return {
      beforeList: assessment.slice(0, count),
      afterList: stored.slice(0, count),
    }
  }

  const split = splitInterleavedImages(stored)
  return {
    beforeList: split.beforeImages,
    afterList: split.afterImages.filter(Boolean),
  }
}

function buildBodyPaintComparePairs(nodes) {
  const assessmentNode = findNode(nodes, STAGE_ASSESSMENT_ID)
  const compareNode = findNode(nodes, STAGE_COMPARE_ID)
  const beforeLabel = (assessmentNode && assessmentNode.title) || '检测记录'
  const afterLabel = (compareNode && compareNode.title) || '完工结果'
  const { beforeList, afterList } = resolveBodyPaintCompareColumns(nodes)
  const pairs = []
  const seen = new Set()
  const count = Math.min(beforeList.length, afterList.length, MAX_COMPARE_PAIRS)

  for (let i = 0; i < count; i += 1) {
    if (!beforeList[i] || !afterList[i]) continue
    pushPair(pairs, seen, {
      id: `assessment_compare_${i}`,
      title:
        count > 1
          ? `第 ${i + 1} 组 · ${beforeLabel} → ${afterLabel}`
          : `${beforeLabel} → ${afterLabel}`,
      beforeUrl: beforeList[i],
      afterUrl: afterList[i],
      beforeLabel,
      afterLabel,
      source: 'assessment_compare',
    })
  }

  return pairs
}

function buildAccidentComparePairs(nodes) {
  const intakeNode = findNode(nodes, STAGE_INTAKE)
  const completeNode = findNode(nodes, STAGE_COMPLETE)
  const beforeImages = nodeImages(intakeNode)
  const afterImages = nodeImages(completeNode)
  const beforeLabel = (intakeNode && intakeNode.title) || '接车记录'
  const afterLabel = (completeNode && completeNode.title) || '完工验收'
  const pairs = []
  const seen = new Set()
  const count = Math.min(beforeImages.length, afterImages.length, MAX_COMPARE_PAIRS)

  for (let i = 0; i < count; i += 1) {
    pushPair(pairs, seen, {
      id: `intake_complete_${i}`,
      title:
        count > 1
          ? `第 ${i + 1} 组 · ${beforeLabel} → ${afterLabel}`
          : `${beforeLabel} → ${afterLabel}`,
      beforeUrl: beforeImages[i],
      afterUrl: afterImages[i],
      beforeLabel,
      afterLabel,
      source: 'cross_stage',
    })
  }

  return pairs
}

function buildAlbumComparePairs(nodes = [], options = {}) {
  const templateId = resolveCompareTemplateId(options)
  if (templateId === 'body_paint') {
    return buildBodyPaintComparePairs(nodes)
  }
  if (templateId === 'accident') {
    return buildAccidentComparePairs(nodes)
  }
  return []
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
  resolveBodyPaintCompareColumns,
}
