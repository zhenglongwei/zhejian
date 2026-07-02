const { config } = require('../config')
const {
  PLAN_QUOTE_PARSE_HINT,
  PLAN_QUOTE_PARSE_METHOD,
} = require('../constants/plan-quote-parse')
const { mockPlanQuoteRows } = require('./plan-quote-ocr.service')
const {
  getPlanQuoteLlmConfig,
  recognizePlanQuoteRowsViaLlm,
} = require('./plan-quote-llm.service')

function buildParseHint(result = {}) {
  const base = PLAN_QUOTE_PARSE_HINT.llm
  const summary = String(result.parseSummary || '').trim()
  const failures = Array.isArray(result.llmFailures) ? result.llmFailures : []
  let hint = base
  if (summary) {
    hint = `${base} ${summary}`
  } else if (failures.length && result.llmEngineLabel) {
    hint = `${base}（前序模型失败，已切换至 ${result.llmEngineLabel}）`
  } else if (result.llmEngineLabel) {
    hint = `${base}（${result.llmEngineLabel}）`
  }
  return hint
}

async function parsePlanQuoteImage(imageUrl) {
  const llmConfig = getPlanQuoteLlmConfig()
  if (!llmConfig.enabled) {
    const err = new Error('智能解析未配置，请手工录入方案配件目录')
    err.status = 503
    throw err
  }

  const llmResult = await recognizePlanQuoteRowsViaLlm(imageUrl)
  return {
    ...llmResult,
    parseMethod: PLAN_QUOTE_PARSE_METHOD.LLM,
    parseHint: buildParseHint(llmResult),
  }
}

async function parsePlanQuoteImageWithFallback(imageUrl) {
  try {
    return await parsePlanQuoteImage(imageUrl)
  } catch (error) {
    if (config.nodeEnv !== 'production') {
      return {
        ...mockPlanQuoteRows(),
        parseMethod: PLAN_QUOTE_PARSE_METHOD.MOCK,
        parseHint: PLAN_QUOTE_PARSE_HINT.mock,
        devFallbackError: String(error.message || error).slice(0, 120),
        llmFailures: error.llmFailures || [],
      }
    }
    throw error
  }
}

module.exports = {
  parsePlanQuoteImage,
  parsePlanQuoteImageWithFallback,
  buildParseHint,
}
