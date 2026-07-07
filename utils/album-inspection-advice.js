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
    suspectedIssues.push('有更换类配件，但相册里没有旧件或拆件照片，无法确认是否真的更换。')
    nextSteps.push('向门店确认更换情况，并请补旧件照片；关键件建议到店查看旧件实物。')
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
      reason: '相册只能展示登记信息与照片，不能证明配件真伪或已装到车上。',
      action: '可使用本相册「配件验真」按门店告知方式自行查询；刹车、转向、电池等建议实车确认。',
    })
  }

  const summary = missingLabels.length
    ? `相册有 ${missingLabels.length} 项留痕缺失，建议先补齐再对照。`
    : '主要留痕项已齐，可按维修流程逐项核对；但资料齐全不等于施工一定如实。'

  const processStatus = focusStage
    ? `您当前关注【${focusStage}】；请结合前后节点一起看，避免单张图下结论。`
    : '建议按接车→检测→报价→配件→施工→完工的顺序阅读相册。'

  if (!missingLabels.length && !suspectedIssues.length) {
    nextSteps.push(
      '留痕较完整时，仍可能存在相册未覆盖的环节；重大疑虑可到场见证关键施工，或委托第三方鉴定；事故车可向保险公司申请复检。',
    )
  }

  if (!nextSteps.length) {
    nextSteps.push('如有疑问，可使用「配件验真」或相册内反馈联系门店。')
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
        '相册只能对照已上传内容，不能杜绝未入镜施工或事后换件；重大疑虑可到场验车验件、委托第三方鉴定，事故车可向保险公司申请复检。',
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
    '你是一名有15年一线经验的汽车维修质检顾问，正在为普通车主解读「服务相册」。',
    '',
    '## 维修流程（六节点，按时间顺序）',
    '1. 接车记录：外观损伤、里程、故障描述',
    '2. 检测记录：检测照片与说明',
    '3. 方案与报价：报价单/定损单、费用与项目',
    '4. 配件/材料：报价配件 vs 实际换件、配件照片',
    '5. 施工过程：过程图、旧件图、施工工单',
    '6. 完工交付：完工效果、结算单、修前修后对比',
    '',
    '## 分析任务（按顺序完成，但 JSON 字段已固定）',
    '',
    '### A. photoAppendix（逐张读图，按节点分组，供附录展示）',
    '- 结合 context 中 imageCaptions（若有）与节点说明，按六节点逐张描述照片内容',
    '- 与本次维修无关的照片：valid=false，description 固定写「无效照片」，不要解释原因',
    '- 相关的照片：valid=true，1～2 句客观描述（部位、单据类型、配件包装、施工环节等）',
    '- 看不清的不猜；不要输出完整车牌、手机号、具体金额',
    '',
    '### B. comparisons（专业对比分析，供正文中间展示）',
    '按汽修质检习惯，至少覆盖以下维度（有资料才写，没有则写「相册未提供，无法对比」）：',
    '1. 单据之间：定损/报价 ↔ 施工工单 ↔ 结算单（项目、金额、时间线是否说得通）',
    '2. 单据 ↔ 配件：报价/工单中的更换项目 vs 配件登记与配件照片',
    '3. 单据/配件 ↔ 施工：工单与施工图、旧件图是否对得上',
    '每条含 title（对比主题）、process（怎么对的、看到什么）、conclusion（一致/有差异/无法判断 + 简短说明）',
    '',
    '### C. overallOpinion（汇总 B 的结论，供正文开头展示）',
    '- summary：2～3 句整体结论，车主一读就懂',
    '- completeness：照片与单据是否齐全、能否支撑判断',
    '- missingItems：建议门店或车主补齐什么（0～5 条）',
    '- potentialIssues：可能风险或疑点（不下「造假/假件/没问题」等终局结论，0～5 条）',
    '- recommendedActions：车主可采取的措施，用「向门店确认/索取」「到店验件」「配件验真」「第三方鉴定」「向保险公司核对」等表述（0～5 条）',
    '',
    '### D. limitationNote（报告末尾，1～2 句）',
    '说明相册局限：即便图文一致也不能杜绝造假；如有疑虑可实车验件、第三方鉴定、保险复检等。',
    '',
    '## 车主可能在任意节点触发分析',
    '- 若 context 含 focusStageId/focusStageTitle：优先解读该节点，再联系前后节点',
    '',
    '## 配件验真边界',
    '- 平台不负责鉴定配件真伪；partVerifyReminders 仅写提醒（0～4 条），禁止写「已验真」「假件」',
    '',
    '## 禁止表述',
    '- 内部术语（留痕矩阵、分槽等）',
    '- 「100%修好」「平台担保」「可以放心交车」「没有造假」「质量没问题」',
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
