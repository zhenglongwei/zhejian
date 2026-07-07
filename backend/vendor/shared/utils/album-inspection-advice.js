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

function normalizeAdvicePayload(raw = {}, source = 'rule') {
  const pickLines = (list) =>
    (Array.isArray(list) ? list : [])
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item.text === 'string') return item.text.trim()
        return ''
      })
      .filter(Boolean)

  const stageObservations = (Array.isArray(raw.stageObservations) ? raw.stageObservations : [])
    .map((row) => ({
      stageId: String((row && row.stageId) || '').trim(),
      stageTitle: String((row && row.stageTitle) || '').trim(),
      observation: String((row && row.observation) || '').trim(),
      concern: String((row && row.concern) || '').trim(),
    }))
    .filter((row) => row.observation)
    .slice(0, 8)

  const partVerifyReminders = (Array.isArray(raw.partVerifyReminders) ? raw.partVerifyReminders : [])
    .map((row) => ({
      partName: String((row && row.partName) || '').trim(),
      reason: String((row && row.reason) || '').trim(),
      action: String((row && row.action) || '').trim(),
    }))
    .filter((row) => row.partName && row.reason)
    .slice(0, 6)

  return {
    summary: String(raw.summary || '').trim().slice(0, 280),
    processStatus: String(raw.processStatus || '').trim().slice(0, 280),
    focusAreas: pickLines(raw.focusAreas).slice(0, 6),
    stageObservations,
    suspectedIssues: pickLines(raw.suspectedIssues).slice(0, 8).map((text) => ({ text })),
    partVerifyReminders,
    suggestedPhotos: pickLines(raw.suggestedPhotos).slice(0, 6),
    nextSteps: pickLines(raw.nextSteps).slice(0, 6),
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
      summary,
      processStatus,
      focusAreas: focusStage
        ? [`优先看【${focusStage}】及前后相邻节点的照片与说明。`]
        : ['先看「完整性」缺什么，再按「检查方法」三段说明对照。'],
      stageObservations: stageObservations.slice(0, 4),
      suspectedIssues,
      partVerifyReminders,
      suggestedPhotos: missingLabels.slice(0, 5).map((label) => `${label}相关照片或单据`),
      nextSteps,
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
    '1. 接车记录：外观损伤、里程、故障描述是否清楚',
    '2. 检测记录：检测照片与说明能否支撑后续方案',
    '3. 方案与报价：报价单/定损单、费用与项目说明',
    '4. 配件/材料：报价里的配件 vs 实际换件、配件照片',
    '5. 施工过程：过程图、旧件图、施工工单是否对应',
    '6. 完工交付：完工效果、结算单、修前修后对比',
    '',
    '## 如何读图（若提供 imageCaptions）',
    '- 结合 stageTitle、label、门店 note 理解每张照片在流程中的位置',
    '- 后节点必须联系前节点：例如施工图要对照报价/工单；配件图要对照报价清单',
    '- 看不清的内容不要猜；不要编造车牌、手机号、具体金额',
    '',
    '## 车主可能在任意节点触发分析',
    '- 若 context 含 focusStageId/focusStageTitle：先响应该节点，再简要联系前后节点',
    '- 说明当前维修进展到哪一步、已留痕是否支撑判断、还缺什么',
    '',
    '## 配件验真（重要边界）',
    '- 平台不负责鉴定配件真伪，也不保证与车上实物一致',
    '- 对刹车片、转向、电池、气囊等关键件：可提醒车主使用「配件验真」或到店查看包装/编码/旧件',
    '- partVerifyReminders 写提醒，不要写「已验真」「假件」等结论',
    '',
    '## 相册能力边界（必须牢记，勿给车主虚假安全感）',
    '- 「资料自洽」≠「施工如实」：单据、配件图、施工图全部对得上，仍可能存在未入镜施工、旧件事后替换、以次充好、虚报或账外项目',
    '- 相册价值：帮车主看懂流程、发现明显缺口与不一致，提高商家造假留痕成本；不能杜绝造假',
    '- 禁止在核对通过时写「可以放心」「没有造假」「质量没问题」「可以交车」等结论',
    '- 若留痕齐全、无明显疑点：仍应在 processStatus 或 nextSteps 中温和说明相册局限；建议关键节点到场、保留旧件、关键件验真',
    '- 要尽可能接近全程可信：全程在场见证施工，或事后委托有资质第三方鉴定',
    '- 事故维修如有怀疑：可向承保保险公司申请复检，或反映定损与施工不符',
    '',
    '## 输出要求',
    '- 大白话，短句，禁止「登记」「分槽」「留痕矩阵」等内部术语',
    '- 禁止「100%修好」「平台担保」「已鉴定为真/假」「资料齐全即可放心」',
    '- 行动建议用「向门店确认/索取」或「向保险公司核对」',
    '- 只输出 JSON，不要 markdown。字段：',
    '{"summary":"一句话总评","processStatus":"当前进展与相册能支撑的判断","focusAreas":["…"],"stageObservations":[{"stageId":"stage_x","stageTitle":"…","observation":"…","concern":"可选"}],"suspectedIssues":["…"],"partVerifyReminders":[{"partName":"…","reason":"…","action":"…"}],"suggestedPhotos":["…"],"nextSteps":["…"]}',
    '- summary/processStatus 各 1～2 句；suspectedIssues 0～5 条；partVerifyReminders 0～4 条',
  ].join('\n')
}

function buildLlmUserPrompt(context = {}) {
  const focusHint = context.focusStageTitle
    ? `车主当前正在查看【${context.focusStageTitle}】（${context.focusStageId}），请优先解读该节点并联系全流程。`
    : '车主在检查页请求全流程解读。'

  return [
    focusHint,
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
