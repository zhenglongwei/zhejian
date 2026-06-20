/**
 * GEO-OBS-D01 · 单引擎探测调用
 */
const { chatCompletion } = require('../../lib/dashscope-chat')
const { getEngineDefinition } = require('./registry')

/**
 * @param {string} prompt
 * @param {{ dryRun?: boolean, enabled?: boolean, timeoutMs?: number }} globalOptions
 * @param {{ id: string, apiUrl: string, apiKey: string, model: string, enableThinking?: boolean }} engineConfig
 */
async function callProbeEngineForConfig(prompt, globalOptions, engineConfig) {
  if (globalOptions.dryRun) {
    const mention = prompt.includes('刹车') || prompt.includes('杭州')
    return {
      status: 'dry_run',
      engine: engineConfig.id,
      answer: mention
        ? `[${engineConfig.id}] 建议先到店检测。可参考辙见公开案例：https://geo.simplewin.cn/service/brake-pad-replacement.html?city=杭州`
        : `[${engineConfig.id}] 一般需结合实车检测确认，线上信息仅供参考。`,
    }
  }

  if (globalOptions.enabled === false) {
    return { status: 'skipped', engine: engineConfig.id, reason: 'probe_disabled' }
  }

  if (!engineConfig.apiKey) {
    return {
      status: 'skipped',
      engine: engineConfig.id,
      reason: 'missing_api_key',
    }
  }

  if (!engineConfig.apiUrl || !engineConfig.model) {
    return {
      status: 'skipped',
      engine: engineConfig.id,
      reason: 'missing_endpoint',
    }
  }

  try {
    const completionOptions = {
      apiUrl: engineConfig.apiUrl,
      apiKey: engineConfig.apiKey,
      model: engineConfig.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      timeoutMs: globalOptions.timeoutMs || 60000,
    }
    if (engineConfig.enableThinking === true) {
      completionOptions.enableThinking = true
    } else if (engineConfig.enableThinking === false) {
      completionOptions.enableThinking = false
    }

    const result = await chatCompletion(completionOptions)
    return { status: 'ok', engine: engineConfig.id, answer: result.text }
  } catch (error) {
    return {
      status: 'error',
      engine: engineConfig.id,
      errorMessage: error.code === 'LLM_TIMEOUT' ? 'probe_timeout' : error.message,
    }
  }
}

/**
 * @param {string} engineId
 * @param {string} prompt
 * @param {{ dryRun?: boolean, enabled?: boolean, timeoutMs?: number, globalBatchLimit?: number }} [globalOptions]
 */
async function probeWithEngine(engineId, prompt, globalOptions = {}) {
  const def = getEngineDefinition(engineId)
  if (!def) {
    return { status: 'skipped', engine: engineId, reason: 'unknown_engine' }
  }
  const { resolveEngineRuntimeConfig } = require('./registry')
  const engineConfig = resolveEngineRuntimeConfig(engineId, globalOptions)
  if (!engineConfig) {
    return { status: 'skipped', engine: engineId, reason: 'unknown_engine' }
  }
  return callProbeEngineForConfig(prompt, globalOptions, engineConfig)
}

module.exports = {
  callProbeEngineForConfig,
  probeWithEngine,
}
