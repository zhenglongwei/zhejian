/**
 * CASE-DRAFT-LOCK · 商家案例稿主动 AI 润色
 * - 正文 sections：merchant-case-draft-polish.md
 * - 规则拼接摘要：merchant-case-summary-polish.md（独立提示词）
 * - media 始终保留，不进模型
 */
const fs = require('fs')
const path = require('path')
const { config } = require('../config')
const { chatCompletion } = require('../lib/dashscope-chat')
const {
  normalizeMerchantCaseDraft,
  mergeLlmSectionsIntoDraft,
  buildRuleCaseSummary,
  stripAmountText,
} = require('./merchant-case-draft.service')

const DRAFT_PROMPT_PATH = path.join(__dirname, '../prompts/merchant-case-draft-polish.md')
const SUMMARY_PROMPT_PATH = path.join(__dirname, '../prompts/merchant-case-summary-polish.md')

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

function readPromptFile(filePath, fallback) {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return fallback
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

function assertLlmAvailable(cfg) {
  if (!cfg.enabled || cfg.dryRun || !cfg.apiKey) {
    const err = new Error('AI 润色暂不可用，请手改正文后确认')
    err.status = 503
    err.code = 'LLM_UNAVAILABLE'
    throw err
  }
}

function albumContext(albumView = {}) {
  return {
    serviceName: albumView.serviceName || '',
    city: albumView.store?.city || albumView.city || '',
    vehicleDisplay: albumView.vehicleDisplay || '',
    storeName: albumView.store?.name || albumView.storeName || '',
    geoAngleHints: albumView.coach?.geoAngleHints || albumView.geoAngleHints || [],
  }
}

/**
 * 独立任务：润色规则自动拼接的案例摘要
 * @param {object} draft 已含 title / sections；caseSummary 为规则稿
 * @param {object} albumView
 * @returns {Promise<string>}
 */
async function polishCaseSummaryWithLlm(draft, albumView = {}) {
  const cfg = getPolishLlmConfig()
  assertLlmAvailable(cfg)

  const title = stripAmountText(draft.title || '')
  const sections = (draft.sections || []).map((sec) => ({
    key: sec.key,
    title: sec.title,
    body: stripAmountText(sec.body),
  }))
  const ruleSummary =
    stripAmountText(draft.caseSummary || '') ||
    buildRuleCaseSummary({ title, sections }, albumView)

  if (!ruleSummary) {
    return ''
  }

  const userPayload = {
    task: 'merchant_case_summary_polish',
    ...albumContext(albumView),
    caseSummary: ruleSummary,
    draft: {
      title,
      sections,
    },
  }

  const completion = await chatCompletion({
    apiKey: cfg.apiKey,
    model: cfg.model,
    timeoutMs: Math.min(cfg.timeoutMs, 60000),
    temperature: 0.4,
    enableThinking: false,
    messages: [
      {
        role: 'system',
        content: readPromptFile(
          SUMMARY_PROMPT_PATH,
          '你只润色规则拼接的案例摘要，输出 JSON：{"caseSummary":""}，禁止编造与金额。',
        ),
      },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
  })

  const parsed = parseLlmJson(completion.text)
  const polished = stripAmountText(parsed.caseSummary || '').slice(0, 250)
  if (!polished) {
    const err = new Error('摘要润色结果无效，请稍后重试或手改')
    err.status = 502
    err.code = 'LLM_SUMMARY_PARSE_FAILED'
    throw err
  }
  return polished
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
  assertLlmAvailable(cfg)

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
    ...albumContext(albumView),
    draft: draftForModel,
  }

  const completion = await chatCompletion({
    apiKey: cfg.apiKey,
    model: cfg.model,
    timeoutMs: cfg.timeoutMs,
    temperature: 0.5,
    enableThinking: false,
    messages: [
      {
        role: 'system',
        content: readPromptFile(
          DRAFT_PROMPT_PATH,
          '你是案例文案助手，只润色结构化 sections，只输出 JSON，禁止编造与金额，不要输出 caseSummary。',
        ),
      },
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

  // 正文润色不改摘要；先合并章节
  const afterSections = mergeLlmSectionsIntoDraft(normalized, {
    title: parsed.title,
    sections: parsed.sections,
  })

  // 按润色后章节重新规则拼摘要，再走摘要专用提示词
  const ruleSummary = buildRuleCaseSummary(afterSections, albumView)
  let caseSummary = ruleSummary
  try {
    caseSummary = await polishCaseSummaryWithLlm(
      { ...afterSections, caseSummary: ruleSummary },
      albumView,
    )
  } catch (e) {
    // 摘要润色失败时保留规则摘要，不阻断正文润色结果
    if (e && e.code === 'LLM_UNAVAILABLE') throw e
    caseSummary = ruleSummary || afterSections.caseSummary || ''
  }

  return normalizeMerchantCaseDraft({
    ...afterSections,
    caseSummary,
    source: 'llm',
  })
}

module.exports = {
  polishMerchantCaseDraftWithLlm,
  polishCaseSummaryWithLlm,
  getPolishLlmConfig,
}
