/**
 * GEO-CITE-A05/A06 · 案例 GEO 证据链质量评估（规则，不调 LLM）
 */
const { extractGeoFromAlbumNodes } = require('./album-geo-extract')
const { defaultInspectResult } = require('./case-article-templates')

const GEO_QUALITY_LEVEL = {
  BLOCK: 'block',
  WEAK: 'weak',
  READY: 'ready',
}

function hasStageEvidence(snapshot) {
  if (!snapshot) return false
  return Boolean(snapshot.hasNote || snapshot.hasImages)
}

/**
 * @param {{ nodes?: object[], coldStart?: boolean, serviceName?: string, planAmount?: number|null, storeNote?: string, imageCount?: number }} input
 */
function assessGeoEvidence(input = {}) {
  const nodes = input.nodes || []
  const imageCount =
    input.imageCount != null
      ? Number(input.imageCount)
      : nodes.reduce((sum, n) => sum + (n.images || []).length, 0)

  const extracted = extractGeoFromAlbumNodes(nodes, {
    coldStart: input.coldStart,
    serviceName: input.serviceName,
    planAmount: input.planAmount,
    storeNote: input.storeNote,
  })

  const snap = extracted.stageSnapshot
  const missingFields = []
  const warnings = []

  if (imageCount < 1) {
    missingFields.push({
      field: 'images',
      stage: '',
      message: '请至少上传一张过程图',
    })
  }

  if (!hasStageEvidence(snap.stage_1)) {
    missingFields.push({
      field: 'stage_1',
      stage: 'stage_1',
      message: '请补充接车记录：故障现象或需求说明，或上传接车图片',
    })
  }

  if (!hasStageEvidence(snap.stage_2)) {
    missingFields.push({
      field: 'stage_2',
      stage: 'stage_2',
      message: '请补充检测诊断：检查结论说明，或上传检测图片',
    })
  }

  const hasPlanEvidence =
    hasStageEvidence(snap.stage_3) ||
    (input.planAmount != null &&
      input.planAmount !== '' &&
      Number.isFinite(Number(input.planAmount)))

  if (!hasPlanEvidence) {
    missingFields.push({
      field: 'stage_3',
      stage: 'stage_3',
      message: '请补充方案与报价：维修方案说明，或填写方案报价金额',
    })
  }

  if (!hasStageEvidence(snap.stage_6)) {
    warnings.push({
      field: 'stage_6',
      message: '建议补充完工交付说明或试车/交付图片，便于生成可引用摘要',
    })
  }

  if (!extracted.fromNodes.inspectResult) {
    warnings.push({
      field: 'inspect_template',
      message: '检查结论为系统默认表述，公开摘要信息密度偏低',
    })
  }

  if (!extracted.fromNodes.faultDesc) {
    warnings.push({
      field: 'fault_fallback',
      message: '故障现象未在接车节点填写，摘要将使用概括表述',
    })
  }

  let level = GEO_QUALITY_LEVEL.READY
  if (missingFields.length > 0) {
    level = GEO_QUALITY_LEVEL.BLOCK
  } else if (warnings.length > 0) {
    level = GEO_QUALITY_LEVEL.WEAK
  }

  const requiredStages = 3
  const requiredFilled = [snap.stage_1, snap.stage_2, hasPlanEvidence ? { hasNote: true } : null].filter(
    Boolean
  ).length
  const score = Math.min(100, Math.round((requiredFilled / requiredStages) * 70 + (imageCount > 0 ? 30 : 0)))

  const summaryParts = []
  if (level === GEO_QUALITY_LEVEL.BLOCK) {
    summaryParts.push(`缺 ${missingFields.length} 项关键证据`)
  } else if (level === GEO_QUALITY_LEVEL.WEAK) {
    summaryParts.push('可提交，建议补全节点说明以提升 AI 可引用质量')
  } else {
    summaryParts.push('关键阶段证据齐全')
  }

  return {
    level,
    score,
    missingFields,
    warnings,
    extracted,
    imageCount,
    summaryText: summaryParts.join('；'),
    isTemplateInspect:
      !extracted.fromNodes.inspectResult &&
      extracted.inspectResult === defaultInspectResult(),
  }
}

/**
 * 商家冷启动提交公开审核时硬拦（用户授权公示不走此路径）
 * @param {object} albumView buildAlbumView 产物
 * @param {{ coldStart?: boolean }} [options]
 */
function assertGeoPublishable(albumView, options = {}) {
  const result = assessGeoEvidence({
    nodes: albumView.nodes || [],
    coldStart: options.coldStart,
    serviceName: albumView.serviceName,
    planAmount: albumView.planAmount,
    storeNote: albumView.storeNote,
    imageCount: albumView.imageCount,
  })

  if (result.level === GEO_QUALITY_LEVEL.BLOCK) {
    const err = new Error('案例证据链不完整，暂无法提交公开审核')
    err.status = 409
    err.code = 'GEO_EVIDENCE_INCOMPLETE'
    err.missingFields = result.missingFields
    err.geoQuality = {
      level: result.level,
      score: result.score,
      summaryText: result.summaryText,
    }
    throw err
  }

  return result
}

module.exports = {
  GEO_QUALITY_LEVEL,
  assessGeoEvidence,
  assertGeoPublishable,
}
