/**
 * 百炼千问 · GEO 探测单条冒烟（不写入 DB）
 *
 * 用法：
 *   npm run geo:probe-smoke
 *   npm run geo:probe-smoke -- --engine=doubao "杭州刹车片更换多少钱"
 *   npm run geo:probe-smoke -- --list-engines
 */
require('dotenv').config()
const {
  probeWithEngine,
  listEngineDefinitions,
  resolveEngineRuntimeConfig,
} = require('../src/services/geo-probe-engines')

function readArg(name) {
  const prefix = `--${name}=`
  const hit = process.argv.find((item) => item.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : ''
}

async function main() {
  if (process.argv.includes('--list-engines')) {
    console.log(
      '[geo-probe-smoke] engines:',
      listEngineDefinitions().map((item) => ({
        id: item.id,
        label: item.label,
        tier: item.tier,
        defaultModel: item.defaultModel,
      }))
    )
    return
  }

  const engineId = readArg('engine') || process.env.GEO_PROBE_ENGINE || 'qwen'
  const prompt =
    process.argv.slice(2).filter((item) => !item.startsWith('--')).join(' ') ||
    '杭州刹车片更换大概多少钱？'

  const engineConfig = resolveEngineRuntimeConfig(engineId, { globalBatchLimit: 1 })
  if (!engineConfig) {
    console.error(`[geo-probe-smoke] unknown engine: ${engineId}`)
    process.exit(1)
  }

  if (!engineConfig.apiKey && process.env.GEO_PROBE_DRY_RUN !== 'true') {
    console.error(
      `[geo-probe-smoke] engine=${engineId} 缺少 API Key（见 GEO_PROBE_${engineId.toUpperCase()}_API_KEY 或 registry 回退键）`
    )
    process.exit(1)
  }

  console.log('[geo-probe-smoke]', {
    engine: engineConfig.id,
    label: engineConfig.label,
    model: engineConfig.model,
    apiUrl: engineConfig.apiUrl,
    prompt,
  })

  const result = await probeWithEngine(engineId, prompt, {
    dryRun: process.env.GEO_PROBE_DRY_RUN === 'true',
    enabled: true,
    timeoutMs: Number(process.env.GEO_PROBE_TIMEOUT_MS || 60000),
  })

  console.log('[geo-probe-smoke] status:', result.status)
  if (result.answer) {
    console.log('[geo-probe-smoke] answer:\n', result.answer)
  }
  if (result.errorMessage || result.reason) {
    console.log('[geo-probe-smoke] detail:', result.errorMessage || result.reason)
  }
  if (result.status === 'error') process.exit(1)
}

main().catch((err) => {
  console.error('[geo-probe-smoke] failed:', err.message)
  process.exit(1)
})
