/**
 * PV-REFORM · 相册文案体检（规则层，不调 LLM）
 */
const { scrubPiiText } = require('../utils/scrub-pii-text')
const { buildPublicRepairPlan } = require('./build-public-view.service')
const {
  PUBLIC_GATE_STATUS,
  VISIBILITY,
} = require('../constants/album-public-visibility-policy')
const { defaultInspectResult, defaultRepairPlan } = require('../utils/case-article-templates')

const COPY_QUALITY_LEVEL = {
  BLOCK: 'block',
  WEAK: 'weak',
  READY: 'ready',
}

const ABSOLUTE_CLAIM = /100%|百分百|彻底修好|永不复发|全网最低|保证全赔/g

function noteText(node) {
  return String(node?.note || '').trim()
}

function pushSuggestion(list, item) {
  list.push(item)
}

function assessCopyQuality(albumView = {}) {
  const nodes = albumView.nodes || []
  const imageMeta = albumView.imageMeta || []
  const suggestions = []
  let score = 100

  const publicMediaCount = imageMeta.filter(
    (row) =>
      row.visibility === VISIBILITY.PUBLIC &&
      row.publicGateStatus === PUBLIC_GATE_STATUS.PASSED,
  ).length

  const stage3 = nodes.find((n) => n.id === 'stage_3')
  const stage3Note = noteText(stage3)
  const planAmount = albumView.planAmount
  const hasPlanAmount = planAmount != null && Number.isFinite(Number(planAmount))
  const stage3Images = imageMeta.filter((row) => row.nodeId === 'stage_3').length

  if (stage3Images > 0 && !hasPlanAmount && !stage3Note) {
    pushSuggestion(suggestions, {
      field: 'stage_3',
      issue: 'plan_text_missing',
      message:
        '已上传报价单照片（仅留档）。若需公示方案与价格，请填写方案金额或在方案阶段补充说明。',
      level: 'weak',
    })
    score -= 15
  }

  if (!hasPlanAmount && !buildPublicRepairPlan(albumView)) {
    pushSuggestion(suggestions, {
      field: 'repairPlan',
      issue: 'public_plan_empty',
      message: '当前无方案摘要，授权公示后案例可能缺少报价与方案说明。',
      level: 'weak',
    })
    score -= 10
  }

  if (publicMediaCount < 1) {
    pushSuggestion(suggestions, {
      field: 'publicMedia',
      issue: 'no_public_media',
      message:
        '暂无可公示的过程/配件图（含敏感信息的图已自动仅留档）。仍可完工留档，但不宜引导车主授权公示。',
      level: 'weak',
    })
    score -= 12
  } else if (publicMediaCount >= 1) {
    nodes.forEach((node) => {
      const hasPublic = imageMeta.some(
        (row) =>
          row.nodeId === node.id &&
          row.visibility === VISIBILITY.PUBLIC &&
          row.publicGateStatus === PUBLIC_GATE_STATUS.PASSED,
      )
      const note = noteText(node)
      if (hasPublic && !note && !['stage_1', 'stage_3'].includes(node.id)) {
        pushSuggestion(suggestions, {
          field: node.id,
          issue: 'note_missing_for_public_image',
          message: `${node.title || node.id}：已有可公示图片，建议补充一句说明便于车主理解。`,
          level: 'weak',
        })
        score -= 4
      }
    })
  }

  nodes.forEach((node) => {
    const raw = noteText(node)
    if (!raw) return
    const scrubbed = scrubPiiText(raw)
    if (scrubbed !== raw) {
      pushSuggestion(suggestions, {
        field: node.id,
        issue: 'pii_in_note',
        message: `${node.title || node.id}：说明中可能含手机号/车牌等，请修改后再保存。`,
        level: 'block',
      })
      score -= 25
    }
    if (ABSOLUTE_CLAIM.test(raw)) {
      pushSuggestion(suggestions, {
        field: node.id,
        issue: 'absolute_claim',
        message: `${node.title || node.id}：请避免「100% 修好 / 全网最低」等绝对化表述。`,
        level: 'block',
      })
      score -= 20
    }
    if (raw.length > 0 && raw.length < 6 && !['stage_1'].includes(node.id)) {
      pushSuggestion(suggestions, {
        field: node.id,
        issue: 'note_too_short',
        message: `${node.title || node.id}：说明过短，建议补充现象或结论。`,
        level: 'weak',
      })
      score -= 5
    }
    const inspectDefault = defaultInspectResult()
    const planDefault = defaultRepairPlan(albumView.serviceName || '维修服务')
    if (node.id === 'stage_2' && raw === inspectDefault) {
      pushSuggestion(suggestions, {
        field: 'stage_2',
        issue: 'template_note',
        message: '检测结论仍为系统默认句，建议改为本车实际情况。',
        level: 'weak',
      })
      score -= 6
    }
    if (node.id === 'stage_3' && raw === planDefault) {
      pushSuggestion(suggestions, {
        field: 'stage_3',
        issue: 'template_note',
        message: '方案说明仍为模板句，建议补充本次维修项目。',
        level: 'weak',
      })
      score -= 6
    }
  })

  const hasBlock = suggestions.some((s) => s.level === 'block')
  const hasWeak = suggestions.some((s) => s.level === 'weak')
  let level = COPY_QUALITY_LEVEL.READY
  if (hasBlock) level = COPY_QUALITY_LEVEL.BLOCK
  else if (hasWeak || score < 70) level = COPY_QUALITY_LEVEL.WEAK

  score = Math.max(0, Math.min(100, score))

  const summaryParts = []
  if (level === COPY_QUALITY_LEVEL.BLOCK) {
    summaryParts.push('存在需修改的合规或隐私表述')
  } else if (level === COPY_QUALITY_LEVEL.WEAK) {
    summaryParts.push('可保存/完工，建议按提示完善后再请车主授权公示')
  } else {
    summaryParts.push('文案与公开素材准备良好')
  }

  return {
    score,
    level,
    suggestions: suggestions.slice(0, 12),
    publicMediaCount,
    hasRepairPlanText: Boolean(buildPublicRepairPlan(albumView)),
    summaryText: summaryParts.join('；'),
    publicReady: publicMediaCount > 0 && (hasPlanAmount || Boolean(buildPublicRepairPlan(albumView))),
  }
}

module.exports = {
  COPY_QUALITY_LEVEL,
  assessCopyQuality,
}
