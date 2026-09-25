/**
 * 节点 AI 检查 · 大模型引擎注册表（失败按序切换）
 *
 * 真源：docs/04_维修过程相册/28_ · 26_ 确认前检查
 * 发给车主前的检查不能因为某一个模型不可用就整段跳过，按序换下一个，
 * 全部不可用才退回规则建议。
 *
 * 只放能看图的多模态模型：检查的对象主要是门店上传的照片，
 * 纯文本模型看不了图，不放进来（2026-09-25 定）。
 *
 * - NODE_AI_REVIEW_LLM_ENGINES=geo_vision,doubao
 * - NODE_AI_REVIEW_LLM_ENGINE_DOUBAO=false 单独停用某一个
 */
const { DEFAULT_API_URL } = require('./dashscope-chat')
const { config } = require('../config')

/** @typedef {'geo_vision'|'doubao'} NodeAiReviewLlmEngineId */

/**
 * @typedef {Object} NodeAiReviewLlmEngineDefinition
 * @property {NodeAiReviewLlmEngineId} id
 * @property {string} label
 * @property {'dashscope'|'volcengine'} vendor
 * @property {'chat'|'responses'} protocol 走 chat/completions 还是 Responses API（两套协议不通用）
 * @property {string} defaultApiUrl
 * @property {string} defaultModel
 * @property {string[]} apiKeyEnvKeys
 * @property {string[]} apiUrlEnvKeys
 * @property {string[]} modelEnvKeys
 * @property {string} [timeoutEnvKey]
 * @property {number} defaultTimeoutMs
 * @property {boolean} [requiresVisionFlag]
 */

/** @type {NodeAiReviewLlmEngineDefinition[]} */
const NODE_AI_REVIEW_LLM_ENGINE_REGISTRY = [
  {
    id: 'geo_vision',
    label: '通义视觉（案例图说模型）',
    vendor: 'dashscope',
    protocol: 'chat',
    defaultApiUrl: DEFAULT_API_URL,
    defaultModel: 'qwen3.6-plus',
    apiKeyEnvKeys: ['GEO_VISION_API_KEY', 'DASHSCOPE_API_KEY'],
    apiUrlEnvKeys: ['GEO_VISION_API_URL'],
    modelEnvKeys: ['GEO_VISION_MODEL'],
    timeoutEnvKey: 'GEO_VISION_TIMEOUT_MS',
    defaultTimeoutMs: 90000,
    requiresVisionFlag: true,
  },
  {
    id: 'doubao',
    label: '豆包（火山方舟）',
    vendor: 'volcengine',
    // Seed 系列走官方 Responses API（老板开通的 Doubao-Seed-2.1-lite 示例即此协议）
    protocol: 'responses',
    defaultApiUrl: 'https://ark.cn-beijing.volces.com/api/v3/responses',
    defaultModel: 'doubao-seed-2-1-lite-260915',
    apiKeyEnvKeys: [
      'NODE_AI_REVIEW_DOUBAO_API_KEY',
      'GEO_PROBE_DOUBAO_API_KEY',
      'ARK_API_KEY',
      'VOLCENGINE_API_KEY',
    ],
    // 只认明确是 Responses 的端点：节点检查固定走 Responses 协议，
    // 读 chat/completions 的地址（GEO 探测用的 GEO_PROBE_DOUBAO_API_URL）会协议错配
    apiUrlEnvKeys: ['NODE_AI_REVIEW_DOUBAO_API_URL', 'GEO_PROBE_DOUBAO_RESPONSES_API_URL'],
    modelEnvKeys: ['NODE_AI_REVIEW_DOUBAO_MODEL', 'GEO_PROBE_DOUBAO_MODEL'],
    timeoutEnvKey: 'NODE_AI_REVIEW_DOUBAO_TIMEOUT_MS',
    defaultTimeoutMs: 90000,
  },
]

const ENGINE_MAP = new Map(NODE_AI_REVIEW_LLM_ENGINE_REGISTRY.map((item) => [item.id, item]))

const DEFAULT_ENGINE_CHAIN = ['geo_vision', 'doubao']

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

function isEngineExplicitlyDisabled(def) {
  return process.env[`NODE_AI_REVIEW_LLM_ENGINE_${def.id.toUpperCase()}`] === 'false'
}

/** 视觉引擎只在模型闸打开时参与 */
function isVisionGloballyEnabled() {
  return (config.geoVision || {}).enabled !== false
}

function resolveNodeAiReviewLlmEngineConfig(engineId) {
  const id = String(engineId || '').trim().toLowerCase()
  const def = ENGINE_MAP.get(id)
  if (!def) return null

  if (isEngineExplicitlyDisabled(def)) {
    return { id: def.id, label: def.label, vendor: def.vendor, configured: false, disabled: true }
  }
  if (def.requiresVisionFlag && !isVisionGloballyEnabled()) {
    return { id: def.id, label: def.label, vendor: def.vendor, configured: false, disabled: true }
  }

  const timeoutRaw = def.timeoutEnvKey ? process.env[def.timeoutEnvKey] : undefined
  const apiUrl =
    resolveFirstEnv(def.apiUrlEnvKeys) || String(def.defaultApiUrl || DEFAULT_API_URL).trim()
  const apiKey = resolveFirstEnv(def.apiKeyEnvKeys)
  const model = resolveFirstEnv(def.modelEnvKeys) || String(def.defaultModel || '').trim()

  return {
    id: def.id,
    label: def.label,
    vendor: def.vendor,
    protocol: def.protocol || 'chat',
    apiUrl,
    apiKey,
    model,
    timeoutMs: Number(timeoutRaw) > 0 ? Number(timeoutRaw) : def.defaultTimeoutMs,
    configured: Boolean(apiKey && model && apiUrl),
    disabled: false,
  }
}

/**
 * 已配置、可调用的引擎，按链序返回；调用方依次尝试即可
 */
function resolveConfiguredNodeAiReviewEngines() {
  const requested = parseEngineIdList(process.env.NODE_AI_REVIEW_LLM_ENGINES)
  const ids = requested.length ? requested : DEFAULT_ENGINE_CHAIN
  return ids
    .map((id) => resolveNodeAiReviewLlmEngineConfig(id))
    .filter((item) => item && item.configured && !item.disabled)
}

module.exports = {
  NODE_AI_REVIEW_LLM_ENGINE_REGISTRY,
  DEFAULT_ENGINE_CHAIN,
  resolveNodeAiReviewLlmEngineConfig,
  resolveConfiguredNodeAiReviewEngines,
}
