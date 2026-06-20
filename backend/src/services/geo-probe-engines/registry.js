/**
 * GEO-OBS-D01 · 探测引擎注册表（OpenAI 兼容 Chat Completions）
 *
 * 元宝（混元）为独立 App/API，可检索开放 Web，与微信小程序内搜一搜（OBS-W）不同。
 */
const { DEFAULT_API_URL } = require('../../lib/dashscope-chat')

/** @typedef {'qwen'|'doubao'|'kimi'|'wenxin'|'yuanbao'} GeoProbeEngineId */

/**
 * @typedef {Object} GeoProbeEngineDefinition
 * @property {GeoProbeEngineId} id
 * @property {string} label
 * @property {string} defaultApiUrl
 * @property {string} defaultModel
 * @property {string[]} apiKeyEnvKeys
 * @property {string} apiUrlEnvKey
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
    defaultModel: 'qwen-plus',
    apiKeyEnvKeys: ['GEO_PROBE_QWEN_API_KEY', 'GEO_PROBE_API_KEY', 'DASHSCOPE_API_KEY'],
    apiUrlEnvKey: 'GEO_PROBE_QWEN_API_URL',
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
    defaultApiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    defaultModel: 'doubao-1-5-pro-32k',
    apiKeyEnvKeys: ['GEO_PROBE_DOUBAO_API_KEY', 'ARK_API_KEY', 'VOLCENGINE_API_KEY'],
    apiUrlEnvKey: 'GEO_PROBE_DOUBAO_API_URL',
    modelEnvKey: 'GEO_PROBE_DOUBAO_MODEL',
    batchLimitEnvKey: 'GEO_PROBE_DOUBAO_BATCH_LIMIT',
    defaultBatchLimit: 10,
    tier: 2,
  },
  {
    id: 'kimi',
    label: 'Kimi（Moonshot）',
    defaultApiUrl: 'https://api.moonshot.cn/v1/chat/completions',
    defaultModel: 'moonshot-v1-8k',
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
    defaultModel: 'ernie-4.0-turbo-8k',
    apiKeyEnvKeys: ['GEO_PROBE_WENXIN_API_KEY', 'QIANFAN_API_KEY', 'QIANFAN_ACCESS_KEY'],
    apiUrlEnvKey: 'GEO_PROBE_WENXIN_API_URL',
    modelEnvKey: 'GEO_PROBE_WENXIN_MODEL',
    batchLimitEnvKey: 'GEO_PROBE_WENXIN_BATCH_LIMIT',
    defaultBatchLimit: 10,
    tier: 2,
  },
  {
    id: 'yuanbao',
    label: '腾讯元宝（混元）',
    defaultApiUrl: 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions',
    defaultModel: 'hunyuan-turbos-latest',
    apiKeyEnvKeys: ['GEO_PROBE_YUANBAO_API_KEY', 'HUNYUAN_API_KEY', 'TENCENT_HUNYUAN_API_KEY'],
    apiUrlEnvKey: 'GEO_PROBE_YUANBAO_API_URL',
    modelEnvKey: 'GEO_PROBE_YUANBAO_MODEL',
    batchLimitEnvKey: 'GEO_PROBE_YUANBAO_BATCH_LIMIT',
    defaultBatchLimit: 10,
    tier: 2,
  },
]

const ENGINE_MAP = new Map(GEO_PROBE_ENGINE_REGISTRY.map((item) => [item.id, item]))

const ALL_ENGINE_IDS = GEO_PROBE_ENGINE_REGISTRY.map((item) => item.id)

function getEngineDefinition(engineId) {
  return ENGINE_MAP.get(String(engineId || '').trim()) || null
}

function listEngineDefinitions() {
  return [...GEO_PROBE_ENGINE_REGISTRY]
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
  const def = getEngineDefinition(engineId)
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

  return {
    id: def.id,
    label: def.label,
    tier: def.tier,
    apiUrl: String(process.env[def.apiUrlEnvKey] || def.defaultApiUrl).trim(),
    apiKey: resolveFirstEnv(def.apiKeyEnvKeys),
    model: String(process.env[def.modelEnvKey] || def.defaultModel).trim(),
    batchLimit,
    enableThinking,
    configured: false,
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
    if (cfg.batchLimit <= 0) continue
    cfg.configured = Boolean(cfg.apiKey)
    configs.push(cfg)
  }
  return configs
}

module.exports = {
  GEO_PROBE_ENGINE_REGISTRY,
  ALL_ENGINE_IDS,
  getEngineDefinition,
  listEngineDefinitions,
  parseEngineIdList,
  resolveEngineRuntimeConfig,
  resolveEnabledEngineConfigs,
}
