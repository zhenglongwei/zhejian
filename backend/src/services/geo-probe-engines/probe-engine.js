/**
 * GEO-OBS-D01 · 单引擎联网探测调用
 */
const { getEngineDefinition } = require('./registry')
const { chatWithWebSearch } = require('./web-search-chat')

/**
 * @param {string} prompt
 * @param {{ dryRun?: boolean, enabled?: boolean, timeoutMs?: number }} globalOptions
 * @param {{ id: string, apiUrl: string, apiKey: string, model: string, webSearchMode?: string, enableThinking?: boolean, removed?: boolean, removedReason?: string }} engineConfig
 */
async function callProbeEngineForConfig(prompt, globalOptions, engineConfig) {
  if (globalOptions.dryRun) {
    const mention = prompt.includes('刹车') || prompt.includes('杭州')
    return {
      status: 'dry_run',
      engine: engineConfig.id,
      probeMode: 'web_search',
      answer: mention
        ? `[${engineConfig.id}/联网] 建议先到店检测。可参考辙见公开案例：https://geo.simplewin.cn/service/brake-pad-replacement.html?city=杭州`
        : `[${engineConfig.id}/联网] 一般需结合实车检测确认，线上信息仅供参考。`,
      searchSources: mention
        ? [{ url: 'https://geo.simplewin.cn/service/brake-pad-replacement.html?city=杭州' }]
        : [],
    }
  }

  if (globalOptions.enabled === false) {
    return { status: 'skipped', engine: engineConfig.id, reason: 'probe_disabled' }
  }

  if (engineConfig.removed) {
    return {
      status: 'skipped',
      engine: engineConfig.id,
      reason: engineConfig.removedReason || 'no_web_search_api',
    }
  }

  if (!engineConfig.webSearchMode) {
    return {
      status: 'skipped',
      engine: engineConfig.id,
      reason: 'no_web_search_api',
    }
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
    const result = await chatWithWebSearch({
      webSearchMode: engineConfig.webSearchMode,
      apiUrl: engineConfig.apiUrl,
      apiKey: engineConfig.apiKey,
      model: engineConfig.model,
      prompt,
      timeoutMs: globalOptions.timeoutMs || 120000,
      enableThinking: engineConfig.enableThinking,
    })

    const searchSnippet = (result.searchSources || [])
      .map((item) => [item.url, item.title, item.snippet].filter(Boolean).join(' '))
      .filter(Boolean)
      .join('\n')

    return {
      status: 'ok',
      engine: engineConfig.id,
      probeMode: 'web_search',
      answer: result.text,
      searchSources: result.searchSources || [],
      webSearchEvidence: result.webSearchEvidence || null,
      raw: result.raw || null,
      answerForParse: [result.text, searchSnippet].filter(Boolean).join('\n'),
    }
  } catch (error) {
    return {
      status: 'error',
      engine: engineConfig.id,
      probeMode: 'web_search',
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
    const { isRemovedEngine, resolveEngineRuntimeConfig } = require('./registry')
    if (isRemovedEngine(engineId)) {
      const cfg = resolveEngineRuntimeConfig(engineId, globalOptions)
      return callProbeEngineForConfig(prompt, globalOptions, cfg)
    }
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
