const { chatCompletion } = require('../lib/dashscope-chat')
const { sanitizePlanPartsDraft } = require('../lib/plan-quote-parse')
const { resolvePlanQuoteImageSources } = require('../lib/plan-quote-image-source')
const {
  isPlanQuoteLlmGloballyEnabled,
  resolveConfiguredPlanQuoteLlmEngines,
  resolvePlanQuoteLlmEngineChain,
} = require('../lib/plan-quote-llm-registry')
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

function mapLlmItemsToDraft(items = []) {
  const list = Array.isArray(items) ? items : []
  return list
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

function buildLlmSystemPrompt() {
  return [
    '你是汽车维修门店报价表结构化助手。',
    '任务：从报价表图片中提取「更换配件/材料」明细行，输出 JSON。',
    '规则：',
    '1. 表头可能是配件/物料/项目/品名等，列可能是单价/价格/数量/工时等，请按语义映射到统一字段。',
    '2. 只提取配件/材料行，忽略工时费、喷漆费、合计行等非配件项（除非明确为总包配件）。',
    '3. partType 必须从给定枚举中选择最接近的一项；无法判断时用「品牌件」。',
    '4. 看不清的字段留空字符串，禁止编造编码。',
    '5. 手写、倾斜、拍照模糊时尽量推断名称与数量，但仍需商家核对。',
    '6. 只输出 JSON，不要 markdown 说明。',
    `partType 枚举：${PART_TYPE_VALUES.join('、')}`,
    '输出格式：{"items":[{"name":"","partType":"","partBrand":"","partCode":"","qty":1,"unitPrice":null,"lineTotal":null}]}',
  ].join('\n')
}

function buildLlmMessages(imageSource) {
  const userPrompt =
    '请读取这张维修报价表/配件清单图片，提取配件明细。' +
    '若为手写或系统截图混合，仍尽量结构化；不确定处留空。'
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

function summarizeFailures(failures = []) {
  return failures
    .map((item) => `${item.label || item.engine}: ${item.reason}`)
    .join('；')
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
    temperature: 0.1,
    responseFormat: { type: 'json_object' },
    enableThinking: engine.enableThinking ? true : false,
    timeoutMs: engine.timeoutMs,
  })

  const payload = extractJsonPayload(result.text)
  const draft = sanitizePlanPartsDraft(mapLlmItemsToDraft(payload?.items))
  if (!draft.length) {
    const err = new Error('未提取到配件行')
    err.status = 422
    throw err
  }

  return {
    provider: `llm:${engine.id}:${engine.model}`,
    llmEngine: engine.id,
    llmEngineLabel: engine.label,
    imageDelivery: imageSource.visionMode,
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
        reason: String(error.message || error).slice(0, 120),
      })
    }
  }

  const err = new Error(
    failures.length
      ? `所有模型均失败：${summarizeFailures(failures)}`
      : '智能解析失败，请手工录入',
  )
  err.status = 422
  err.llmFailures = failures
  throw err
}

module.exports = {
  getPlanQuoteLlmConfig,
  recognizePlanQuoteRowsViaLlm,
  mapLlmItemsToDraft,
}
