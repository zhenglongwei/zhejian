/**
 * GEO 联网探测 · 千问 + 豆包 批量冒烟（不写 DB）
 *
 *   npm run geo:probe-smoke-web
 *   node scripts/geo-probe-smoke-web-engines.js --prompt="辙见 geo.simplewin.cn 杭州刹车片"
 */
require('dotenv').config()
const { probeWithEngine, resolveEngineRuntimeConfig } = require('../src/services/geo-probe-engines')
const { parseProbeAnswer } = require('../src/utils/geo-probe-parse')

const DEFAULT_ENGINES = ['qwen', 'doubao']
const DEFAULT_PROMPTS = [
  '杭州刹车片更换大概多少钱？',
  '辙见 geo.simplewin.cn 是做什么的？公开汽车维修案例',
  '2026年6月21日 杭州西湖区天气怎么样？',
]

function parseArgs(argv) {
  const engines = []
  let prompt = ''
  let verbose = false

  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--verbose') {
      verbose = true
      continue
    }
    if (item.startsWith('--engines=')) {
      engines.push(
        ...item
          .slice('--engines='.length)
          .split(/[,;\s]+/)
          .map((id) => id.trim().toLowerCase())
          .filter(Boolean)
      )
      continue
    }
    if (item.startsWith('--prompt=')) {
      prompt = item.slice('--prompt='.length).trim()
      continue
    }
    if (item.startsWith('--')) continue
    prompt = [prompt, item].filter(Boolean).join(' ').trim()
  }

  return {
    engines: engines.length ? [...new Set(engines)] : DEFAULT_ENGINES,
    prompts: prompt ? [prompt] : DEFAULT_PROMPTS,
    verbose,
  }
}

async function runOne(engineId, prompt, options) {
  const cfg = resolveEngineRuntimeConfig(engineId, { globalBatchLimit: 1 })
  if (!cfg || cfg.removed) {
    return {
      engine: engineId,
      prompt,
      status: 'skipped',
      reason: cfg?.removedReason || 'unknown_engine',
    }
  }
  if (!cfg.apiKey && process.env.GEO_PROBE_DRY_RUN !== 'true') {
    return { engine: engineId, prompt, status: 'skipped', reason: 'missing_api_key' }
  }

  const result = await probeWithEngine(engineId, prompt, options)
  const parseText = result.answerForParse || result.answer || ''
  const parsed =
    result.status === 'ok' || result.status === 'dry_run'
      ? parseProbeAnswer(parseText, { publicBaseUrl: process.env.PUBLIC_BASE_URL || 'https://geo.simplewin.cn' })
      : { mentioned: false, citedUrl: '' }

  return {
    engine: engineId,
    label: cfg.label,
    model: cfg.model,
    webSearchMode: cfg.webSearchMode,
    prompt,
    status: result.status,
    reason: result.reason || result.errorMessage || '',
    errorStatus: result.errorStatus || null,
    errorBody: result.errorBody || null,
    webSearchConfirmed: Boolean(result.webSearchEvidence?.confirmed),
    searchSourceCount: Array.isArray(result.searchSources) ? result.searchSources.length : 0,
    mentioned: parsed.mentioned,
    citedUrl: parsed.citedUrl,
    answerPreview: String(result.answer || '').slice(0, 160),
    searchSources: (result.searchSources || []).slice(0, 3),
    webSearchEvidence: result.webSearchEvidence || null,
    raw: options.verbose ? result.raw : undefined,
  }
}

async function main() {
  const cli = parseArgs(process.argv)
  const callOptions = {
    dryRun: process.env.GEO_PROBE_DRY_RUN === 'true',
    enabled: true,
    timeoutMs: Number(process.env.GEO_PROBE_TIMEOUT_MS || 120000),
    verbose: cli.verbose,
  }

  console.log('[geo-probe-smoke-web] start', {
    engines: cli.engines,
    promptCount: cli.prompts.length,
    dryRun: callOptions.dryRun,
  })

  const rows = []
  for (const engineId of cli.engines) {
    for (const prompt of cli.prompts) {
      console.log(`\n[geo-probe-smoke-web] probing ${engineId} ...`)
      // eslint-disable-next-line no-await-in-loop
      const row = await runOne(engineId, prompt, callOptions)
      rows.push(row)
      console.log('[geo-probe-smoke-web] result:', {
        engine: row.engine,
        status: row.status,
        webSearchConfirmed: row.webSearchConfirmed,
        searchSourceCount: row.searchSourceCount,
        mentioned: row.mentioned,
        citedUrl: row.citedUrl,
      })
      if (cli.verbose && row.searchSources?.length) {
        console.log('[geo-probe-smoke-web] searchSources:', row.searchSources)
      }
      if (cli.verbose && row.raw) {
        console.log('[geo-probe-smoke-web] raw (truncated):', JSON.stringify(row.raw).slice(0, 1500))
      }
      if (row.status === 'error' && row.reason) {
        console.error('[geo-probe-smoke-web] error:', row.reason)
        if (row.errorStatus) console.error('[geo-probe-smoke-web] errorStatus:', row.errorStatus)
        if (row.errorBody) {
          console.error('[geo-probe-smoke-web] errorBody:', JSON.stringify(row.errorBody).slice(0, 800))
        }
      }
    }
  }

  console.log('\n[geo-probe-smoke-web] summary')
  console.table(
    rows.map((row) => ({
      engine: row.engine,
      status: row.status,
      webSearch: row.webSearchConfirmed ? 'yes' : row.status === 'skipped' ? 'skip' : 'no',
      sources: row.searchSourceCount ?? '-',
      mention: row.mentioned ? 'yes' : 'no',
      citation: row.citedUrl ? 'yes' : 'no',
      prompt: row.prompt.slice(0, 36),
    }))
  )

  const hasError = rows.some((row) => row.status === 'error')
  const anyWebSearch = rows.some((row) => row.webSearchConfirmed)
  if (!anyWebSearch) {
    console.warn('[geo-probe-smoke-web] 警告：所有用例均未确认联网（webSearchConfirmed=false）')
  }
  if (hasError) process.exit(1)
}

main().catch((err) => {
  console.error('[geo-probe-smoke-web] failed:', err.message)
  process.exit(1)
})
