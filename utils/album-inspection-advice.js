/**
 * 相册检查 · AI 建议（规则兜底 + LLM 上下文与 Prompt）
 * B-INSP-01
 */
const { buildAlbumInspectionView } = require('./album-inspection-view')
const { collectOldPartTraces } = require('./album-inspection-matrix')
const {
  buildInspectionTimelineContext,
  buildStageTimeline,
} = require('./album-inspection-context')

function pickLines(list) {
  return (Array.isArray(list) ? list : [])
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item.text === 'string') return item.text.trim()
      return ''
    })
    .filter(Boolean)
}

function normalizePhotoAppendix(rawList) {
  return (Array.isArray(rawList) ? rawList : [])
    .map((stage) => {
      const stageId = String((stage && stage.stageId) || '').trim()
      const stageTitle = String((stage && stage.stageTitle) || '').trim()
      const photos = (Array.isArray(stage && stage.photos) ? stage.photos : [])
        .map((photo) => {
          const label = String((photo && photo.label) || '').trim()
          const valid = photo && photo.valid !== false
          const description = valid
            ? String((photo && photo.description) || '').trim()
            : '无效照片'
          return { label, description, valid }
        })
        .filter((photo) => photo.label || photo.description)
        .slice(0, 12)
      return { stageId, stageTitle, photos }
    })
    .filter((stage) => stage.stageTitle && stage.photos.length)
    .slice(0, 6)
}

function normalizeComparisons(rawList) {
  return (Array.isArray(rawList) ? rawList : [])
    .map((row) => ({
      title: String((row && row.title) || '').trim(),
      process: String((row && row.process) || '').trim(),
      conclusion: String((row && row.conclusion) || '').trim(),
    }))
    .filter((row) => row.title && (row.process || row.conclusion))
    .slice(0, 8)
}

function normalizeOverallOpinion(raw = {}) {
  return {
    summary: String(raw.summary || '').trim().slice(0, 400),
    completeness: String(raw.completeness || '').trim().slice(0, 400),
    missingItems: pickLines(raw.missingItems).slice(0, 8),
    potentialIssues: pickLines(raw.potentialIssues).slice(0, 8),
    recommendedActions: pickLines(raw.recommendedActions).slice(0, 8),
  }
}

function mapLegacyToStructured(raw = {}) {
  const stageObservations = (Array.isArray(raw.stageObservations) ? raw.stageObservations : [])
    .map((row) => ({
      stageId: String((row && row.stageId) || '').trim(),
      stageTitle: String((row && row.stageTitle) || '').trim(),
      observation: String((row && row.observation) || '').trim(),
      concern: String((row && row.concern) || '').trim(),
    }))
    .filter((row) => row.observation)

  const partVerifyReminders = (Array.isArray(raw.partVerifyReminders) ? raw.partVerifyReminders : [])
    .map((row) => ({
      partName: String((row && row.partName) || '').trim(),
      reason: String((row && row.reason) || '').trim(),
      action: String((row && row.action) || '').trim(),
    }))
    .filter((row) => row.partName && row.reason)
    .slice(0, 6)

  const suspectedIssues = pickLines(raw.suspectedIssues).slice(0, 8)
  const suggestedPhotos = pickLines(raw.suggestedPhotos).slice(0, 6)
  const nextSteps = pickLines(raw.nextSteps).slice(0, 6)

  const comparisonsFromStages = stageObservations.map((row) => ({
    title: row.stageTitle || row.stageId,
    process: row.observation,
    conclusion: row.concern || '',
  }))

  return {
    overallOpinion: normalizeOverallOpinion({
      summary: raw.summary,
      completeness: raw.processStatus,
      missingItems: suggestedPhotos,
      potentialIssues: suspectedIssues,
      recommendedActions: nextSteps,
    }),
    comparisons: comparisonsFromStages,
    photoAppendix: [],
    limitationNote: '',
    partVerifyReminders,
    focusAreas: pickLines(raw.focusAreas).slice(0, 6),
    stageObservations: stageObservations.slice(0, 8),
    suspectedIssues: suspectedIssues.map((text) => ({ text })),
    suggestedPhotos,
    nextSteps,
    summary: String(raw.summary || '').trim().slice(0, 280),
    processStatus: String(raw.processStatus || '').trim().slice(0, 280),
  }
}

function normalizeAdvicePayload(raw = {}, source = 'rule') {
  const hasStructured =
    raw.overallOpinion ||
    (Array.isArray(raw.comparisons) && raw.comparisons.length) ||
    (Array.isArray(raw.photoAppendix) && raw.photoAppendix.length)

  if (!hasStructured) {
    const legacy = mapLegacyToStructured(raw)
    return {
      ...legacy,
      source: String(source || 'rule'),
    }
  }

  const overallOpinion = normalizeOverallOpinion(raw.overallOpinion || {})
  const comparisons = normalizeComparisons(raw.comparisons)
  const photoAppendix = normalizePhotoAppendix(raw.photoAppendix)
  const limitationNote = String(raw.limitationNote || '').trim().slice(0, 500)
  const partVerifyReminders = (Array.isArray(raw.partVerifyReminders) ? raw.partVerifyReminders : [])
    .map((row) => ({
      partName: String((row && row.partName) || '').trim(),
      reason: String((row && row.reason) || '').trim(),
      action: String((row && row.action) || '').trim(),
    }))
    .filter((row) => row.partName && row.reason)
    .slice(0, 6)

  return {
    overallOpinion,
    comparisons,
    photoAppendix,
    limitationNote,
    partVerifyReminders,
    focusAreas: pickLines(raw.focusAreas).slice(0, 6),
    summary: overallOpinion.summary.slice(0, 280),
    processStatus: overallOpinion.completeness.slice(0, 280),
    stageObservations: [],
    suspectedIssues: overallOpinion.potentialIssues.map((text) => ({ text })),
    suggestedPhotos: overallOpinion.missingItems,
    nextSteps: overallOpinion.recommendedActions,
    source: String(source || 'rule'),
  }
}

function collectMissingInventoryLabels(view = {}) {
  const labels = []
  ;(view.completeness?.panels || []).forEach((panel) => {
    ;(panel.rows || []).forEach((row) => {
      if (!row.present && row.label) labels.push(String(row.label))
    })
  })
  return labels
}

function collectMethodGuideIssues(detail = {}) {
  const { collectGuideIssues } = require('./album-inspection-method-guide')
  const { buildMethodGuideSections } = require('./album-inspection-method-guide')
  const { buildDocumentItems } = require('./album-inspection-view')
  const sections = buildMethodGuideSections(detail, buildDocumentItems(detail), {
    showPartVerify: Boolean((detail.parts || []).length),
  })
  return collectGuideIssues(sections)
}

function buildRuleBasedAdvice(detail = {}, options = {}) {
  const inspection = buildAlbumInspectionView(detail)
  const ctx = buildInspectionTimelineContext(detail, options)
  const missingLabels = collectMissingInventoryLabels(inspection)
  const guideIssues = collectMethodGuideIssues(detail)
  const oldPart = collectOldPartTraces(detail)
  const focusStage = ctx.focusStageTitle

  const suspectedIssues = []
  const nextSteps = []
  const partVerifyReminders = []
  const stageObservations = []

  guideIssues
    .filter((item) => item.text)
    .slice(0, 4)
    .forEach((item) => suspectedIssues.push(item.text))
  guideIssues
    .filter((item) => item.action)
    .slice(0, 4)
    .forEach((item) => nextSteps.push(item.action))

  if (oldPart.allImages.length === 0 && (detail.parts || []).length) {
    suspectedIssues.push('有更换类配件，但相册里暂无旧件或拆件照片，可向门店核对是否已更换。')
    nextSteps.push('可向门店确认更换情况，并请补旧件照片；关键件建议到店查看旧件实物。')
  }

  ctx.timeline.forEach((stage) => {
    if (!stage.filled && stage.stageId !== 'stage_4') {
      stageObservations.push({
        stageId: stage.stageId,
        stageTitle: stage.stageTitle,
        observation: `${stage.stageTitle}几乎无照片或说明。`,
        concern: '该环节留痕不足，后续节点难以对照。',
      })
    }
  })

  if ((detail.parts || []).length) {
    partVerifyReminders.push({
      partName: '关键更换配件',
      reason: '相册展示的是登记信息与照片，便于理解更换了哪些件，不能代替实车核对。',
      action: '有疑问可先向门店确认编码与来源；刹车、转向、电池等建议到店实车核对。',
    })
  }

  const summary = missingLabels.length
    ? `相册还有 ${missingLabels.length} 项可向门店核对的内容，先看已有图文再决定是否补问。`
    : '主要图文较齐，可按接车→检测→施工→完工的顺序阅读，理解本次服务过程。'

  const processStatus = focusStage
    ? `您当前关注【${focusStage}】；可结合前后节点一起看，便于理解整段过程。`
    : '建议按接车→检测→施工→完工的顺序阅读相册。'

  if (!missingLabels.length && !suspectedIssues.length) {
    nextSteps.push(
      '图文较完整时，仍可能有未入镜环节；有疑问可先向门店确认，需要时再到场核对或委托第三方。',
    )
  }

  if (!nextSteps.length) {
    nextSteps.push('如有疑问，可先向门店确认，或使用相册内反馈联系门店。')
  }

  return normalizeAdvicePayload(
    {
      overallOpinion: {
        summary,
        completeness: processStatus,
        missingItems: missingLabels.slice(0, 5).map((label) => `${label}相关照片或单据`),
        potentialIssues: suspectedIssues,
        recommendedActions: nextSteps,
      },
      comparisons: stageObservations.slice(0, 4).map((row) => ({
        title: row.stageTitle,
        process: row.observation,
        conclusion: row.concern || '建议结合前后节点一起看。',
      })),
      photoAppendix: [],
      limitationNote:
        '相册只能解释已上传内容；如有疑问可先向门店核对，需要时再到场验车或委托有资质第三方。',
      focusAreas: focusStage
        ? [`优先看【${focusStage}】及前后相邻节点的照片与说明。`]
        : ['先看「完整性」缺什么，再按「检查方法」三段说明对照。'],
      partVerifyReminders,
    },
    'rule',
  )
}

function buildLlmContext(detail = {}, options = {}) {
  const ctx = buildInspectionTimelineContext(detail, options)
  return {
    ...ctx,
    imageCaptions: options.imageCaptions || [],
  }
}

function buildLlmSystemPrompt() {
  return [
    '你是一名有经验的汽车维修顾问，正在为普通车主**增强说明**「服务相册」里的图文：解释照片与备注含义，帮助理解门店做了什么。',
    '',
    '## 维修流程（四阶段；存量相册可能仍有历史方案/配件节点）',
    '1. 接车记录：外观、车架号、里程、故障描述',
    '2. 检测记录：检测照片与说明',
    '3. 施工过程：过程图、材料/配件照片备注、新旧件对比（历史相册可能另有方案/配件节点）',
    '4. 完工交付：完工效果、结算单、质保说明',
    '',
    '## 分析任务（按顺序完成，但 JSON 字段已固定）',
    '',
    '### A. photoAppendix（逐张读图，按节点分组，供附录展示）',
    '- 结合 context 中 imageCaptions（若有）与节点说明，按阶段逐张描述照片内容',
    '- 与本次维修无关的照片：valid=false，description 固定写「无效照片」，不要解释原因',
    '- 相关的照片：valid=true，1～2 句客观描述（部位、单据类型、配件包装、施工环节等）',
    '- 看不清的不猜；不要输出完整车牌、手机号、具体金额',
    '',
    '### B. comparisons（对照说明，供正文中间展示）',
    '按汽修习惯说明已上传资料之间是否说得通（有资料才写；没有则写「相册未提供，暂无法对照」）：',
    '1. 单据：定损（若有）↔ 结算单（项目与时间线是否大致说得通）',
    '2. 施工图文 ↔ 检测/接车描述：是否能看出在处理同一问题',
    '3. 材料/配件照片备注：包装、编码等是否在图文中有交代',
    '每条含 title（主题）、process（看到什么）、conclusion（一致/有差异/无法判断 + 简短说明）',
    '',
    '### C. overallOpinion（汇总 B 的结论，供正文开头展示）',
    '- summary：2～3 句整体说明，车主一读就懂（偏「解释过程」而非挑刺）',
    '- completeness：照片与单据是否齐全、能否支撑理解',
    '- missingItems：建议向门店核对或补齐什么（0～5 条；语气平和）',
    '- potentialIssues：需要再确认的点（不下「造假/假件/重大问题」等定性结论，0～5 条）',
    '- recommendedActions：用「向门店确认/索取」「到店核对」「委托第三方」「向保险公司了解」等表述（0～5 条）；勿引导「配件验真」主路径',
    '',
    '### D. limitationNote（报告末尾，1～2 句）',
    '说明相册只能解释已上传内容；如有疑问可先向门店核对，必要时实车核对或第三方鉴定。',
    '',
    '## 车主可能在任意节点触发分析',
    '- 若 context 含 focusStageId/focusStageTitle：优先解读该节点，再联系前后节点',
    '',
    '## 配件边界',
    '- 平台不负责鉴定配件真伪；partVerifyReminders 可写平和提醒（0～4 条），禁止写「已验真」「假件」「造假」',
    '',
    '## 禁止表述',
    '- 内部术语（留痕矩阵、分槽等）',
    '- 「100%修好」「平台担保」「可以放心交车」「没有造假」「质量没问题」',
    '- 「造假嫌疑」「重大问题」「门店不诚信」等羞辱或定性话术',
    '',
    '## 输出要求',
    '- 大白话、短句；只输出 JSON，不要 markdown',
    '- 字段结构：',
    '{"overallOpinion":{"summary":"","completeness":"","missingItems":[],"potentialIssues":[],"recommendedActions":[]},"comparisons":[{"title":"","process":"","conclusion":""}],"photoAppendix":[{"stageId":"stage_x","stageTitle":"","photos":[{"label":"","description":"","valid":true}]}],"limitationNote":"","partVerifyReminders":[{"partName":"","reason":"","action":""}]}',
  ].join('\n')
}

function buildLlmUserPrompt(context = {}) {
  const focusHint = context.focusStageTitle
    ? `车主当前正在查看【${context.focusStageTitle}】（${context.focusStageId}），请优先解读该节点并联系全流程。`
    : '车主在检查页请求全流程解读。'

  return [
    focusHint,
    '请按 system 要求完成 A→B→C→D 四步分析。',
    '以下是相册结构化摘要与（如有）AI读图说明；不含原图 URL：',
    JSON.stringify(context),
    '请生成车主能直接阅读的 JSON 检查报告。',
  ].join('\n\n')
}

function extractAdviceJson(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  const jsonText =
    start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate
  try {
    return JSON.parse(jsonText)
  } catch (e) {
    return null
  }
}

module.exports = {
  normalizeAdvicePayload,
  buildRuleBasedAdvice,
  buildLlmContext,
  buildLlmSystemPrompt,
  buildLlmUserPrompt,
  extractAdviceJson,
  collectMissingInventoryLabels,
  buildInspectionTimelineContext,
  buildStageTimeline,
}
