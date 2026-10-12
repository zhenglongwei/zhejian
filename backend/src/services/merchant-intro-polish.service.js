const fs = require('fs')
const path = require('path')
const { config } = require('../config')
const { chatCompletion } = require('../lib/dashscope-chat')

const PROMPT_PATH = path.join(__dirname, '../prompts/merchant-intro-polish.md')

function text(value) {
  return String(value || '').trim()
}

function llmConfig() {
  const llm = config.geoLlm || {}
  const enabled = process.env.GEO_LLM_ENABLED === 'true' || llm.enabled === true
  const dryRun = process.env.GEO_LLM_DRY_RUN === 'true' || (!enabled && llm.dryRun !== false && !llm.enabled)
  return {
    enabled,
    dryRun,
    apiKey: text(process.env.GEO_LLM_API_KEY || llm.apiKey || process.env.DASHSCOPE_API_KEY),
    apiUrl: text(llm.apiUrl),
    model: text(process.env.GEO_LLM_MODEL || llm.model || 'qwen3.7-flash'),
    timeoutMs: Number(process.env.GEO_LLM_TIMEOUT_MS || llm.timeoutMs || 45000),
  }
}

function readPrompt() {
  try {
    return fs.readFileSync(PROMPT_PATH, 'utf8')
  } catch (e) {
    return '根据资料写一段门店介绍概要。只输出 JSON：{"intro":""}'
  }
}

function parseIntro(raw) {
  const textBody = String(raw || '').trim()
  if (!textBody) return ''
  try {
    const parsed = JSON.parse(textBody)
    return text(parsed && parsed.intro)
  } catch (e) {
    const start = textBody.indexOf('{')
    const end = textBody.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return text(JSON.parse(textBody.slice(start, end + 1)).intro)
      } catch (err) {
        return ''
      }
    }
    return ''
  }
}

function factsFrom(input = {}) {
  const techs = Array.isArray(input.technicianRoles) ? input.technicianRoles.map(text).filter(Boolean) : []
  return {
    storeName: text(input.storeName),
    address: text(input.address),
    businessHours: text(input.businessHours),
    currentIntro: text(input.currentIntro).slice(0, 500),
    services: Array.isArray(input.services) ? input.services.map(text).filter(Boolean).slice(0, 12) : [],
    specialtyBrands: Array.isArray(input.specialtyBrands) ? input.specialtyBrands.map(text).filter(Boolean).slice(0, 12) : [],
    establishedOn: text(input.establishedOn).slice(0, 10),
    technicianCount: Number(input.technicianCount) || 0,
    technicianRoles: techs.slice(0, 8),
  }
}

async function polishMerchantIntro(input = {}) {
  const cfg = llmConfig()
  if (!cfg.enabled || cfg.dryRun || !cfg.apiKey) {
    const err = new Error('润色暂不可用')
    err.status = 503
    throw err
  }
  const facts = factsFrom(input)
  const result = await chatCompletion({
    apiUrl: cfg.apiUrl || undefined,
    apiKey: cfg.apiKey,
    model: cfg.model,
    messages: [
      { role: 'system', content: readPrompt() },
      { role: 'user', content: JSON.stringify(facts) },
    ],
    temperature: 0.4,
    responseFormat: { type: 'json_object' },
    enableThinking: false,
    timeoutMs: Math.min(cfg.timeoutMs, 45000),
  })
  const intro = parseIntro(result && result.text).slice(0, 500)
  if (!intro) {
    const err = new Error('没有生成介绍')
    err.status = 502
    throw err
  }
  return intro
}

module.exports = {
  polishMerchantIntro,
  factsFrom,
  parseIntro,
}
