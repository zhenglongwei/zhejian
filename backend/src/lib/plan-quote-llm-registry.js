/**
 * 方案报价表 · 多模态 LLM 引擎注册表（失败按序切换）
 *
 * 环境变量：
 * - PLAN_QUOTE_LLM_ENGINES=plan_quote,geo_vision,qwen_vl,doubao,kimi
 * - PLAN_QUOTE_LLM_ENABLED=false 关闭整条链路
 */
const { DEFAULT_API_URL } = require('./dashscope-chat')
const { config } = require('../config')

/** @typedef {'plan_quote'|'geo_vision'|'qwen_vl'|'doubao'|'kimi'} PlanQuoteLlmEngineId */

/**
 * @typedef {Object} PlanQuoteLlmEngineDefinition
 * @property {PlanQuoteLlmEngineId} id
 * @property {string} label
 * @property {string} defaultApiUrl
 * @property {string} defaultModel
 * @property {string[]} apiKeyEnvKeys
 * @property {string[]} apiUrlEnvKeys
 * @property {string[]} modelEnvKeys
 * @property {string} [timeoutEnvKey]
 * @property {number} defaultTimeoutMs
 * @property {string} [enableThinkingEnvKey]
 * @property {string} [disableEnvKey]
 */

/** @type {PlanQuoteLlmEngineDefinition[]} */
const PLAN_QUOTE_LLM_ENGINE_REGISTRY = [
  {
    id: 'plan_quote',
    label: '报价表专用',
    defaultApiUrl:
      process.env.PLAN_QUOTE_LLM_API_URL ||
      config.planQuoteLlm?.apiUrl ||
      DEFAULT_API_URL,
    defaultModel:
      process.env.PLAN_QUOTE_LLM_MODEL ||
      config.planQuoteLlm?.model ||
      'qwen-vl-plus',
    apiKeyEnvKeys: ['PLAN_QUOTE_LLM_API_KEY', 'DASHSCOPE_API_KEY'],
    apiUrlEnvKeys: ['PLAN_QUOTE_LLM_API_URL'],
    modelEnvKeys: ['PLAN_QUOTE_LLM_MODEL'],
    timeoutEnvKey: 'PLAN_QUOTE_LLM_TIMEOUT_MS',
    defaultTimeoutMs: Number(config.planQuoteLlm?.timeoutMs || 90000),
    enableThinkingEnvKey: 'PLAN_QUOTE_LLM_ENABLE_THINKING',
    disableEnvKey: 'PLAN_QUOTE_LLM_ENGINE_PLAN_QUOTE',
  },
  {
    id: 'geo_vision',
    label: '案例图说模型',
    defaultApiUrl:
      process.env.GEO_VISION_API_URL ||
      config.geoVision?.apiUrl ||
      DEFAULT_API_URL,
    defaultModel:
      process.env.GEO_VISION_MODEL || config.geoVision?.model || 'qwen3.6-plus',
    apiKeyEnvKeys: ['GEO_VISION_API_KEY', 'DASHSCOPE_API_KEY'],
    apiUrlEnvKeys: ['GEO_VISION_API_URL'],
    modelEnvKeys: ['GEO_VISION_MODEL'],
    timeoutEnvKey: 'GEO_VISION_TIMEOUT_MS',
    defaultTimeoutMs: Number(config.geoVision?.timeoutMs || 90000),
    enableThinkingEnvKey: 'GEO_VISION_ENABLE_THINKING',
    disableEnvKey: 'PLAN_QUOTE_LLM_ENGINE_GEO_VISION',
  },
  {
    id: 'qwen_vl',
    label: '通义 VL 兜底',
    defaultApiUrl: DEFAULT_API_URL,
    defaultModel: 'qwen-vl-plus',
    apiKeyEnvKeys: ['DASHSCOPE_API_KEY'],
    apiUrlEnvKeys: ['PLAN_QUOTE_QWEN_VL_API_URL'],
    modelEnvKeys: ['PLAN_QUOTE_QWEN_VL_MODEL'],
    timeoutEnvKey: 'PLAN_QUOTE_QWEN_VL_TIMEOUT_MS',
    defaultTimeoutMs: 90000,
    enableThinkingEnvKey: 'PLAN_QUOTE_QWEN_VL_ENABLE_THINKING',
    disableEnvKey: 'PLAN_QUOTE_LLM_ENGINE_QWEN_VL',
  },
  {
    id: 'doubao',
    label: '豆包多模态',
    defaultApiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    defaultModel: 'doubao-seed-1-6-250615',
    apiKeyEnvKeys: [
      'PLAN_QUOTE_DOUBAO_API_KEY',
      'GEO_PROBE_DOUBAO_API_KEY',
      'ARK_API_KEY',
      'VOLCENGINE_API_KEY',
    ],
    apiUrlEnvKeys: ['PLAN_QUOTE_DOUBAO_API_URL', 'GEO_PROBE_DOUBAO_API_URL'],
    modelEnvKeys: ['PLAN_QUOTE_DOUBAO_MODEL', 'GEO_PROBE_DOUBAO_MODEL'],
    timeoutEnvKey: 'PLAN_QUOTE_DOUBAO_TIMEOUT_MS',
    defaultTimeoutMs: 90000,
    disableEnvKey: 'PLAN_QUOTE_LLM_ENGINE_DOUBAO',
  },
  {
    id: 'kimi',
    label: 'Kimi 多模态',
    defaultApiUrl: 'https://api.moonshot.cn/v1/chat/completions',
    defaultModel: 'moonshot-v1-8k-vision-preview',
    apiKeyEnvKeys: ['PLAN_QUOTE_KIMI_API_KEY', 'GEO_PROBE_KIMI_API_KEY', 'MOONSHOT_API_KEY'],
    apiUrlEnvKeys: ['PLAN_QUOTE_KIMI_API_URL', 'GEO_PROBE_KIMI_API_URL'],
    modelEnvKeys: ['PLAN_QUOTE_KIMI_MODEL', 'GEO_PROBE_KIMI_MODEL'],
    timeoutEnvKey: 'PLAN_QUOTE_KIMI_TIMEOUT_MS',
    defaultTimeoutMs: 90000,
    disableEnvKey: 'PLAN_QUOTE_LLM_ENGINE_KIMI',
  },
]

const ENGINE_MAP = new Map(PLAN_QUOTE_LLM_ENGINE_REGISTRY.map((item) => [item.id, item]))

const DEFAULT_ENGINE_CHAIN = ['plan_quote', 'geo_vision', 'qwen_vl', 'doubao', 'kimi']

function resolveFirstEnv(keys = []) {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim()
    if (value) return value
  }
  return ''
}

function parseEngineIdList(raw) {
  return String(raw || '')
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((id, index, arr) => arr.indexOf(id) === index)
}

function isPlanQuoteLlmGloballyEnabled() {
  return process.env.PLAN_QUOTE_LLM_ENABLED !== 'false'
}

function isEngineExplicitlyDisabled(def) {
  if (!def.disableEnvKey) return false
  return process.env[def.disableEnvKey] === 'false'
}

/**
 * @param {PlanQuoteLlmEngineId} engineId
 */
function resolvePlanQuoteLlmEngineConfig(engineId) {
  const id = String(engineId || '').trim().toLowerCase()
  const def = ENGINE_MAP.get(id)
  if (!def) return null

  if (isEngineExplicitlyDisabled(def)) {
    return {
      id: def.id,
      label: def.label,
      apiUrl: '',
      apiKey: '',
      model: '',
      timeoutMs: def.defaultTimeoutMs,
      enableThinking: false,
      configured: false,
      disabled: true,
    }
  }

  const enableThinkingEnv = def.enableThinkingEnvKey
    ? process.env[def.enableThinkingEnvKey]
    : undefined
  let enableThinking = false
  if (enableThinkingEnv === 'true') enableThinking = true
  if (enableThinkingEnv === 'false') enableThinking = false

  const timeoutRaw = def.timeoutEnvKey ? process.env[def.timeoutEnvKey] : undefined
  const timeoutMs = Number(timeoutRaw) > 0 ? Number(timeoutRaw) : def.defaultTimeoutMs

  const apiUrl =
    resolveFirstEnv(def.apiUrlEnvKeys) || String(def.defaultApiUrl || DEFAULT_API_URL).trim()
  const apiKey = resolveFirstEnv(def.apiKeyEnvKeys)
  const model = resolveFirstEnv(def.modelEnvKeys) || String(def.defaultModel || '').trim()

  return {
    id: def.id,
    label: def.label,
    apiUrl,
    apiKey,
    model,
    timeoutMs,
    enableThinking,
    configured: Boolean(apiKey && model && apiUrl),
    disabled: false,
  }
}

function resolvePlanQuoteLlmEngineChain() {
  const requested = parseEngineIdList(process.env.PLAN_QUOTE_LLM_ENGINES)
  const ids = requested.length ? requested : DEFAULT_ENGINE_CHAIN
  const configs = []
  for (const engineId of ids) {
    const cfg = resolvePlanQuoteLlmEngineConfig(engineId)
    if (!cfg) continue
    configs.push(cfg)
  }
  return configs
}

function resolveConfiguredPlanQuoteLlmEngines() {
  if (!isPlanQuoteLlmGloballyEnabled()) return []
  return resolvePlanQuoteLlmEngineChain().filter((item) => item.configured && !item.disabled)
}

module.exports = {
  PLAN_QUOTE_LLM_ENGINE_REGISTRY,
  DEFAULT_ENGINE_CHAIN,
  parseEngineIdList,
  isPlanQuoteLlmGloballyEnabled,
  resolvePlanQuoteLlmEngineConfig,
  resolvePlanQuoteLlmEngineChain,
  resolveConfiguredPlanQuoteLlmEngines,
}
