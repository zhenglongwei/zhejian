/**
 * GEO-OBS-D01 · 探测引擎注册表（仅支持 API 联网搜索的引擎）
 *
 * 不联网的 Chat Completions 已从探测链路移除。
 * DeepSeek 仅通过火山方舟 Responses API + web_search 接入（官方 DeepSeek API 无联网）。
 */
const { DEFAULT_API_URL } = require('../../lib/dashscope-chat')

/** @typedef {'qwen'|'doubao'|'deepseek'|'kimi'|'wenxin'} GeoProbeEngineId */
/** @typedef {'enable_search'|'responses_web_search'|'builtin_web_search'|'web_search_object'|'enable_enhancement'} GeoProbeWebSearchMode */

/**
 * @typedef {Object} GeoProbeEngineDefinition
 * @property {GeoProbeEngineId} id
 * @property {string} label
 * @property {string} defaultApiUrl
 * @property {string} [defaultWebSearchApiUrl]
 * @property {string} defaultModel
 * @property {GeoProbeWebSearchMode} webSearchMode
 * @property {string[]} apiKeyEnvKeys
 * @property {string} apiUrlEnvKey
 * @property {string} [webSearchApiUrlEnvKey]
 * @property {string} modelEnvKey
 * @property {string} batchLimitEnvKey
 * @property {number} defaultBatchLimit
 * @property {number} tier
 * @property {string} [enableThinkingEnvKey]
 * @property {boolean} [defaultEnableThinking]
 */

/** @type {GeoProbeEngineDefinition[]} */
const GEO_PROBE_ENGINE_REGISTRY = [
  {
    id: 'qwen',
    label: '通义千问',
    defaultApiUrl: DEFAULT_API_URL,
    defaultWebSearchApiUrl:
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    defaultModel: 'qwen-plus',
    webSearchMode: 'enable_search',
    apiKeyEnvKeys: ['GEO_PROBE_QWEN_API_KEY', 'GEO_PROBE_API_KEY', 'DASHSCOPE_API_KEY'],
    apiUrlEnvKey: 'GEO_PROBE_QWEN_API_URL',
    webSearchApiUrlEnvKey: 'GEO_PROBE_QWEN_WEBSEARCH_API_URL',
    modelEnvKey: 'GEO_PROBE_QWEN_MODEL',
    batchLimitEnvKey: 'GEO_PROBE_QWEN_BATCH_LIMIT',
    defaultBatchLimit: 20,
    tier: 1,
    enableThinkingEnvKey: 'GEO_PROBE_QWEN_ENABLE_THINKING',
    defaultEnableThinking: false,
  },
  {
    id: 'doubao',
    label: '豆包（火山方舟）',
    defaultApiUrl: 'https://ark.cn-beijing.volces.com/api/v3/responses',
    defaultWebSearchApiUrl: 'https://ark.cn-beijing.volces.com/api/v3/responses',
    defaultModel: 'doubao-seed-1-6-250615',
    webSearchMode: 'responses_web_search',
    apiKeyEnvKeys: ['GEO_PROBE_DOUBAO_API_KEY', 'ARK_API_KEY', 'VOLCENGINE_API_KEY'],
    apiUrlEnvKey: 'GEO_PROBE_DOUBAO_API_URL',
    webSearchApiUrlEnvKey: 'GEO_PROBE_DOUBAO_RESPONSES_API_URL',
    modelEnvKey: 'GEO_PROBE_DOUBAO_MODEL',
    batchLimitEnvKey: 'GEO_PROBE_DOUBAO_BATCH_LIMIT',
    defaultBatchLimit: 10,
    tier: 2,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek（火山方舟）',
    defaultApiUrl: 'https://ark.cn-beijing.volces.com/api/v3/responses',
    defaultWebSearchApiUrl: 'https://ark.cn-beijing.volces.com/api/v3/responses',
    defaultModel: 'deepseek-v4-pro',
    webSearchMode: 'responses_web_search',
    apiKeyEnvKeys: ['GEO_PROBE_DEEPSEEK_API_KEY', 'ARK_API_KEY', 'VOLCENGINE_API_KEY'],
    apiUrlEnvKey: 'GEO_PROBE_DEEPSEEK_API_URL',
    webSearchApiUrlEnvKey: 'GEO_PROBE_DEEPSEEK_RESPONSES_API_URL',
    modelEnvKey: 'GEO_PROBE_DEEPSEEK_MODEL',
    batchLimitEnvKey: 'GEO_PROBE_DEEPSEEK_BATCH_LIMIT',
    defaultBatchLimit: 10,
    tier: 2,
  },
  {
    id: 'kimi',
    label: 'Kimi（Moonshot）',
    defaultApiUrl: 'https://api.moonshot.cn/v1/chat/completions',
    defaultModel: 'kimi-k2-turbo-preview',
    webSearchMode: 'builtin_web_search',
    apiKeyEnvKeys: ['GEO_PROBE_KIMI_API_KEY', 'MOONSHOT_API_KEY'],
    apiUrlEnvKey: 'GEO_PROBE_KIMI_API_URL',
    modelEnvKey: 'GEO_PROBE_KIMI_MODEL',
    batchLimitEnvKey: 'GEO_PROBE_KIMI_BATCH_LIMIT',
    defaultBatchLimit: 10,
    tier: 2,
  },
  {
    id: 'wenxin',
    label: '百度文心（千帆）',
    defaultApiUrl: 'https://qianfan.baidubce.com/v2/chat/completions',
    defaultModel: 'ernie-4.5-turbo-32k',
    webSearchMode: 'web_search_object',
    apiKeyEnvKeys: ['GEO_PROBE_WENXIN_API_KEY', 'QIANFAN_API_KEY', 'QIANFAN_ACCESS_KEY'],
    apiUrlEnvKey: 'GEO_PROBE_WENXIN_API_URL',
    modelEnvKey: 'GEO_PROBE_WENXIN_MODEL',
    batchLimitEnvKey: 'GEO_PROBE_WENXIN_BATCH_LIMIT',
    defaultBatchLimit: 10,
    tier: 2,
  },
]

/**
 * 已从注册表移除
 * - yuanbao：TokenHub hy3-preview 实测 enable_enhancement 无 search_info（2026-06-21 ECS A/B）
 */
const REMOVED_ENGINE_IDS = ['yuanbao']

const ENGINE_MAP = new Map(GEO_PROBE_ENGINE_REGISTRY.map((item) => [item.id, item]))

const ALL_ENGINE_IDS = GEO_PROBE_ENGINE_REGISTRY.map((item) => item.id)

function getEngineDefinition(engineId) {
  return ENGINE_MAP.get(String(engineId || '').trim()) || null
}

function listEngineDefinitions() {
  return [...GEO_PROBE_ENGINE_REGISTRY]
}

function isRemovedEngine(engineId) {
  return REMOVED_ENGINE_IDS.includes(String(engineId || '').trim().toLowerCase())
}

function parseEngineIdList(raw) {
  return String(raw || '')
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((id, index, arr) => arr.indexOf(id) === index)
}

function resolveFirstEnv(keys) {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim()
    if (value) return value
  }
  return ''
}

/**
 * @param {GeoProbeEngineId} engineId
 * @param {{ globalBatchLimit?: number }} [options]
 */
function resolveEngineRuntimeConfig(engineId, options = {}) {
  const id = String(engineId || '').trim().toLowerCase()
  if (isRemovedEngine(id)) {
    return {
      id,
      label: id,
      tier: 0,
      apiUrl: '',
      apiKey: '',
      model: '',
      batchLimit: 0,
      webSearchMode: '',
      configured: false,
      removed: true,
      removedReason:
        id === 'yuanbao' ? 'tokenhub_hy3_enhancement_no_search_info' : 'no_web_search_api',
    }
  }

  const def = getEngineDefinition(id)
  if (!def) return null

  const globalCap = Math.min(Math.max(Number(options.globalBatchLimit) || 50, 1), 50)
  const envBatchRaw = process.env[def.batchLimitEnvKey]
  const envBatch =
    envBatchRaw != null && String(envBatchRaw).trim() !== ''
      ? Number(envBatchRaw)
      : def.defaultBatchLimit
  const batchLimit = Math.min(
    Math.max(Number.isFinite(envBatch) ? envBatch : def.defaultBatchLimit, 0),
    globalCap
  )

  const enableThinkingEnv = def.enableThinkingEnvKey
    ? process.env[def.enableThinkingEnvKey]
    : undefined
  let enableThinking = def.defaultEnableThinking
  if (enableThinkingEnv === 'true') enableThinking = true
  if (enableThinkingEnv === 'false') enableThinking = false

  const webSearchApiUrlKey = def.webSearchApiUrlEnvKey || def.apiUrlEnvKey
  const defaultWebSearchApiUrl = def.defaultWebSearchApiUrl || def.defaultApiUrl

  return {
    id: def.id,
    label: def.label,
    tier: def.tier,
    webSearchMode: def.webSearchMode,
    apiUrl: String(process.env[webSearchApiUrlKey] || defaultWebSearchApiUrl).trim(),
    apiKey: resolveFirstEnv(def.apiKeyEnvKeys),
    model: String(process.env[def.modelEnvKey] || def.defaultModel).trim(),
    batchLimit,
    enableThinking,
    configured: false,
    removed: false,
  }
}

function resolveEnabledEngineConfigs(options = {}) {
  const fromList = parseEngineIdList(process.env.GEO_PROBE_ENGINES)
  const legacyList = parseEngineIdList(process.env.GEO_PROBE_ENGINE)
  const requested = fromList.length ? fromList : legacyList.length ? legacyList : ['qwen']

  const configs = []
  for (const engineId of requested) {
    const cfg = resolveEngineRuntimeConfig(engineId, options)
    if (!cfg) continue
    if (cfg.removed) {
      cfg.configured = false
      configs.push(cfg)
      continue
    }
    if (cfg.batchLimit <= 0) continue
    cfg.configured = Boolean(cfg.apiKey)
    configs.push(cfg)
  }
  return configs
}

module.exports = {
  GEO_PROBE_ENGINE_REGISTRY,
  ALL_ENGINE_IDS,
  REMOVED_ENGINE_IDS,
  getEngineDefinition,
  listEngineDefinitions,
  isRemovedEngine,
  parseEngineIdList,
  resolveEngineRuntimeConfig,
  resolveEnabledEngineConfigs,
}
