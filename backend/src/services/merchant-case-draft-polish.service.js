/**
 * CASE-DRAFT-LOCK · 商家案例稿主动 AI 润色（文字-only，保留 media）
 */
const fs = require('fs')
const path = require('path')
const { config } = require('../config')
const { chatCompletion } = require('../lib/dashscope-chat')
const {
  normalizeMerchantCaseDraft,
  mergeLlmSectionsIntoDraft,
  stripAmountText,
} = require('./merchant-case-draft.service')

const PROMPT_PATH = path.join(__dirname, '../prompts/merchant-case-draft-polish.md')

function getPolishLlmConfig() {
  const llm = config.geoLlm || {}
  const enabled = process.env.GEO_LLM_ENABLED === 'true' || llm.enabled === true
  const dryRun =
    process.env.GEO_LLM_DRY_RUN === 'true' || (!enabled && llm.dryRun !== false && !llm.enabled)
  return {
    enabled,
    dryRun,
    apiKey: String(
      process.env.GEO_LLM_API_KEY || llm.apiKey || process.env.DASHSCOPE_API_KEY || '',
    ).trim(),
    model: String(process.env.GEO_LLM_MODEL || llm.model || 'qwen3.6-plus').trim(),
    timeoutMs: Number(process.env.GEO_LLM_TIMEOUT_MS || llm.timeoutMs || 90000),
  }
}

function readSystemPrompt() {
  try {
    return fs.readFileSync(PROMPT_PATH, 'utf8')
  } catch {
    return '你是案例文案助手，只润色结构化 sections，只输出 JSON，禁止编造与金额。'
  }
}

function parseLlmJson(text) {
  const raw = String(text || '').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch (_) {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1))
      } catch (e) {
        return {}
      }
    }
    return {}
  }
}

/**
 * @param {object} baseDraft 当前预览稿（含 media）
 * @param {object} albumView
 * @returns {Promise<object>} 润色后 draft（media 保留）
 */
async function polishMerchantCaseDraftWithLlm(baseDraft, albumView = {}) {
  const normalized = normalizeMerchantCaseDraft(baseDraft)
  if (!normalized) {
    const err = new Error('案例稿无效')
    err.status = 400
    throw err
  }

  const cfg = getPolishLlmConfig()
  if (!cfg.enabled || cfg.dryRun || !cfg.apiKey) {
    const err = new Error('AI 润色暂不可用，请手改正文后确认')
    err.status = 503
    err.code = 'LLM_UNAVAILABLE'
    throw err
  }

  const draftForModel = {
    title: stripAmountText(normalized.title),
    sections: (normalized.sections || []).map((sec) => ({
      key: sec.key,
      title: sec.title,
      body: stripAmountText(sec.body),
    })),
  }

  const userPayload = {
    task: 'merchant_case_draft_polish',
    serviceName: albumView.serviceName || '',
    city: albumView.store?.city || albumView.city || '',
    vehicleDisplay: albumView.vehicleDisplay || '',
    storeName: albumView.store?.name || albumView.storeName || '',
    geoAngleHints: albumView.coach?.geoAngleHints || albumView.geoAngleHints || [],
    draft: draftForModel,
  }

  const completion = await chatCompletion({
    apiKey: cfg.apiKey,
    model: cfg.model,
    timeoutMs: cfg.timeoutMs,
    temperature: 0.5,
    enableThinking: false,
    messages: [
      { role: 'system', content: readSystemPrompt() },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
  })

  const parsed = parseLlmJson(completion.text)
  if (!parsed || (!parsed.sections && !parsed.title)) {
    const err = new Error('AI 润色结果无效，请稍后重试或手改')
    err.status = 502
    err.code = 'LLM_PARSE_FAILED'
    throw err
  }

  return mergeLlmSectionsIntoDraft(normalized, parsed)
}

module.exports = {
  polishMerchantCaseDraftWithLlm,
  getPolishLlmConfig,
}
