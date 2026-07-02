const { chatCompletion } = require('../lib/dashscope-chat')
const { sanitizePlanPartsDraft } = require('../lib/plan-quote-parse')
const { resolvePlanQuoteImageSources } = require('../lib/plan-quote-image-source')
const {
  isPlanQuoteLlmGloballyEnabled,
  resolveConfiguredPlanQuoteLlmEngines,
  resolvePlanQuoteLlmEngineChain,
} = require('../lib/plan-quote-llm-registry')
const {
  PLAN_QUOTE_SHEET_TYPE,
  PLAN_QUOTE_NO_PARTS_MESSAGE,
} = require('../constants/plan-quote-parse')
const { PART_TYPE } = require('../../../constants/part-type')

const PART_TYPE_VALUES = Object.values(PART_TYPE)

function extractJsonPayload(text) {
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
    const err = new Error('智能解析返回格式无效')
    err.status = 422
    throw err
  }
}

function shouldSkipLlmItem(item = {}) {
  const kind = String(item.itemKind || item.kind || '').trim().toLowerCase()
  if (kind === 'labor' || kind === 'fee' || kind === 'summary') return true
  if (item.include === false || item.isPart === false) return true
  return false
}

function mapLlmItemsToDraft(items = []) {
  const list = Array.isArray(items) ? items : []
  return list
    .filter((item) => !shouldSkipLlmItem(item))
    .map((item, index) => ({
      planPartId: String(item.planPartId || item.id || `plan_${index + 1}`),
      name: String(item.name || item.partName || '').trim(),
      partType: String(item.partType || item.type || PART_TYPE.BRAND).trim(),
      partBrand: String(item.partBrand || item.brand || '').trim(),
      partCode: String(item.partCode || item.code || '').trim(),
      qty: Number(item.qty || item.quantity) > 0 ? Number(item.qty || item.quantity) : 1,
      unitPrice:
        item.unitPrice != null && item.unitPrice !== '' ? Number(item.unitPrice) : null,
      lineTotal:
        item.lineTotal != null && item.lineTotal !== '' ? Number(item.lineTotal) : null,
      status: 'draft',
    }))
    .filter((row) => row.name)
}

function buildNoPartsUserMessage(payload = {}) {
  const sheetType = String(payload.sheetType || '').trim().toLowerCase()
  const reason = String(payload.noPartsReason || payload.message || '').trim()
  if (
    sheetType === PLAN_QUOTE_SHEET_TYPE.LABOR_CATALOG ||
    /价目|参考表|车型.*单价|工时.*车型/.test(reason)
  ) {
    return PLAN_QUOTE_NO_PARTS_MESSAGE.labor_catalog
  }
  if (
    sheetType === PLAN_QUOTE_SHEET_TYPE.LABOR_ONLY ||
    (/工时|服务项目|修理项目/.test(reason) && !/配件|物料|材料/.test(reason))
  ) {
    return PLAN_QUOTE_NO_PARTS_MESSAGE.labor_only
  }
  if (reason) return reason.slice(0, 160)
  return PLAN_QUOTE_NO_PARTS_MESSAGE.default
}

function buildLlmSystemPrompt() {
  return [
    '你是汽车维修门店「方案配件目录」结构化助手。',
    '背景：真实维修报价/方案常混合维修项目、更换作业、零配件、油液、工时费、喷漆费等；表格列名与列数不统一。',
    '任务：从图片中识别「本次方案需登记备货的零配件/材料」写入 items；供门店核对后用于配件验真对照。',
    '',
    '提取规则（重要）：',
    '1. 混合报价是常态：同一表可同时含配件费、工时费、材料费；按语义拆行，只把零配件/油液/滤清器/轮胎等实物写入 items。',
    '2. 行内混合（如「刹车片 280 + 工时 120」）→ 配件名「刹车片」，金额优先填 unitPrice/lineTotal 的配件部分；看不清则 lineTotal 可空。',
    '3. 「更换/换/换装」类作业若明确涉及可更换件（如换水泵、换机油格、换刹车片）→ 提取对应配件名（水泵、机油格、刹车片），qty 默认 1。',
    '4. 纯工时/工位/喷漆/检测/拆装费，且无对应实物配件 → 不写入 items（itemKind=labor，include=false）。',
    '5. 「大修发动机、钣金修复、四轮定位」等整项作业若无单独列明配件 → 不臆造配件行。',
    '6. 工时价目参考表（修理项目×车型单价的通用价目，非某一单报价）→ sheetType=labor_catalog；其中「换××」且能对应实物者仍可提取为 items，其余忽略。',
    '7. 禁止编造编码；看不清留空。partType 从枚举选最接近项，默认「品牌件」。',
    '8. 只输出 JSON，不要 markdown。',
    '',
    `partType 枚举：${PART_TYPE_VALUES.join('、')}`,
    'sheetType：parts | mixed | labor_catalog | labor_only | unknown',
    '输出格式：',
    '{"sheetType":"mixed","summary":"简述忽略了哪些纯工时行","noPartsReason":"","items":[{"name":"刹车片","partType":"品牌件","partBrand":"","partCode":"","qty":1,"unitPrice":null,"lineTotal":null,"itemKind":"part","include":true}]}',
  ].join('\n')
}

function buildLlmMessages(imageSource) {
  const userPrompt =
    '请读取这张维修方案/报价表图片。' +
    '从维修、更换、零配件、工时等混合内容中，提取应纳入「方案配件目录」的零配件与材料行；' +
    '纯工时费行跳过。列名可能是配件/物料/项目/修理项目/单价/工时等。不确定处留空，禁止编造。'
  return [
    { role: 'system', content: buildLlmSystemPrompt() },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageSource.visionUrl } },
        { type: 'text', text: userPrompt },
      ],
    },
  ]
}

function getPlanQuoteLlmConfig() {
  const engines = resolveConfiguredPlanQuoteLlmEngines()
  return {
    enabled: isPlanQuoteLlmGloballyEnabled() && engines.length > 0,
    engines,
    chain: resolvePlanQuoteLlmEngineChain().map((item) => item.id),
  }
}

async function invokePlanQuoteEngine(engine, imageSource) {
  const result = await chatCompletion({
    apiUrl: engine.apiUrl,
    apiKey: engine.apiKey,
    model: engine.model,
    messages: buildLlmMessages(imageSource),
    temperature: 0.15,
    responseFormat: { type: 'json_object' },
    enableThinking: engine.enableThinking ? true : false,
    timeoutMs: engine.timeoutMs,
  })

  const payload = extractJsonPayload(result.text)
  const draft = sanitizePlanPartsDraft(mapLlmItemsToDraft(payload?.items))
  if (!draft.length) {
    const err = new Error(buildNoPartsUserMessage(payload))
    err.code = 'PLAN_QUOTE_NO_PARTS'
    err.status = 422
    err.sheetType = String(payload?.sheetType || '').trim()
    throw err
  }

  return {
    provider: `llm:${engine.id}:${engine.model}`,
    llmEngine: engine.id,
    llmEngineLabel: engine.label,
    imageDelivery: imageSource.visionMode,
    sheetType: String(payload?.sheetType || PLAN_QUOTE_SHEET_TYPE.MIXED).trim(),
    parseSummary: String(payload?.summary || '').trim().slice(0, 120),
    textPreview: String(result.text || '').slice(0, 240),
    planPartsDraft: draft,
  }
}

async function recognizePlanQuoteRowsViaLlm(imageUrl) {
  const engines = resolveConfiguredPlanQuoteLlmEngines()
  if (!isPlanQuoteLlmGloballyEnabled()) {
    const err = new Error('智能解析已关闭，请手工维护方案配件目录')
    err.status = 503
    throw err
  }
  if (!engines.length) {
    const err = new Error('未配置可用的报价表智能解析模型，请设置 DASHSCOPE_API_KEY 或 PLAN_QUOTE_LLM_API_KEY')
    err.status = 503
    throw err
  }

  const imageSource = resolvePlanQuoteImageSources(imageUrl)
  const failures = []

  for (const engine of engines) {
    try {
      const result = await invokePlanQuoteEngine(engine, imageSource)
      return {
        ...result,
        llmFallbackChain: engines.map((item) => item.id),
        llmAttemptedEngines: failures.map((item) => item.engine).concat([engine.id]),
        llmFailures: failures,
      }
    } catch (error) {
      failures.push({
        engine: engine.id,
        label: engine.label,
        reason: String(error.message || error).slice(0, 160),
        sheetType: error.sheetType || '',
      })
    }
  }

  const err = new Error(
    failures.length
      ? failures[failures.length - 1].reason || PLAN_QUOTE_NO_PARTS_MESSAGE.default
      : PLAN_QUOTE_NO_PARTS_MESSAGE.default,
  )
  err.code = 'PLAN_QUOTE_NO_PARTS'
  err.status = 422
  err.llmFailures = failures
  throw err
}

module.exports = {
  getPlanQuoteLlmConfig,
  recognizePlanQuoteRowsViaLlm,
  mapLlmItemsToDraft,
  buildNoPartsUserMessage,
}
