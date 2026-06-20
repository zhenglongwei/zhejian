/**
 * GEO 探测 · 单条冒烟（不写入 DB）
 *
 * 用法：
 *   npm run geo:probe-smoke
 *   npm run geo:probe-smoke -- --engine=doubao "你好"
 *   npm run geo:probe-smoke -- --engine doubao 你好
 *   node scripts/geo-probe-smoke.js --engine=doubao "你好"   # 推荐：不经过 npm 传参
 *   npm run geo:probe-smoke -- --list-engines
 */
require('dotenv').config()
const {
  probeWithEngine,
  listEngineDefinitions,
  resolveEngineRuntimeConfig,
  parseEngineIdList,
} = require('../src/services/geo-probe-engines')

/**
 * @param {string[]} argv process.argv
 */
function parseSmokeCli(argv) {
  const args = argv.slice(2)
  let engineId = ''
  const promptParts = []

  for (let i = 0; i < args.length; i += 1) {
    const item = args[i]
    if (item === '--list-engines') continue
    if (item.startsWith('--engine=')) {
      engineId = item.slice('--engine='.length).trim()
      continue
    }
    if (item === '--engine') {
      engineId = String(args[i + 1] || '').trim()
      i += 1
      continue
    }
    if (item.startsWith('--')) continue
    promptParts.push(item)
  }

  return {
    engineId,
    prompt: promptParts.join(' ').trim(),
  }
}

function resolveSmokeEngineId(cliEngineId) {
  if (cliEngineId) return cliEngineId.toLowerCase()

  const fromEngines = parseEngineIdList(process.env.GEO_PROBE_ENGINES)
  if (fromEngines.length) return fromEngines[0]

  const fromLegacy = parseEngineIdList(process.env.GEO_PROBE_ENGINE)
  if (fromLegacy.length) return fromLegacy[0]

  return 'qwen'
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

  const cli = parseSmokeCli(process.argv)
  const engineId = resolveSmokeEngineId(cli.engineId)
  const prompt = cli.prompt || '杭州刹车片更换大概多少钱？'

  if (!cli.engineId && parseEngineIdList(process.env.GEO_PROBE_ENGINE).length > 1) {
    console.warn(
      '[geo-probe-smoke] 提示：GEO_PROBE_ENGINE=qwen,doubao 是多引擎列表，smoke 默认只测第一个；' +
        '测豆包请加 --engine=doubao，或改用 GEO_PROBE_ENGINES=qwen,doubao'
    )
  }

  const engineConfig = resolveEngineRuntimeConfig(engineId, { globalBatchLimit: 1 })
  if (!engineConfig) {
    console.error(`[geo-probe-smoke] unknown engine: ${engineId}`)
    process.exit(1)
  }

  if (!engineConfig.apiKey && process.env.GEO_PROBE_DRY_RUN !== 'true') {
    console.error(
      `[geo-probe-smoke] engine=${engineId} 缺少 API Key（GEO_PROBE_${engineId.toUpperCase()}_API_KEY 或 ARK_API_KEY 等）`
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
