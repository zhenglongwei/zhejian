/**
 * GEO-OBS-B06/D02 · 手动触发 Prompt 探测（多引擎）
 *   npm run geo:probe              # 默认 dry_run 模拟
 *   npm run geo:probe -- --live    # 真实 API（需 GEO_PROBE_ENABLED + 各引擎 Key）
 *   npm run geo:probe -- --live --engines=qwen,doubao --limit=5
 */
require('dotenv').config()
const { runGeoPromptProbeBatch, buildGeoProbeReport } = require('../src/services/geo-prompt-probe.service')
const { prisma } = require('../src/lib/prisma')

function readArg(name) {
  const prefix = `--${name}=`
  const hit = process.argv.find((item) => item.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : ''
}

async function main() {
  const live = process.argv.includes('--live')
  if (live) {
    process.env.GEO_PROBE_DRY_RUN = 'false'
    process.env.GEO_PROBE_ENABLED = 'true'
  } else if (process.env.GEO_PROBE_DRY_RUN !== 'false') {
    process.env.GEO_PROBE_DRY_RUN = 'true'
  }

  const enginesRaw = readArg('engines')
  const engines = enginesRaw
    ? enginesRaw.split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean)
    : undefined

  const result = await runGeoPromptProbeBatch({
    limit: readArg('limit') || undefined,
    engines,
  })
  const report = await buildGeoProbeReport({ days: 7 })
  console.log('[geo-probe]', {
    engines: result.engineSummaries,
    processed: result.processed,
    dryRun: result.dryRun,
    metrics: report.metrics,
    byEngine: report.byEngine,
  })
}

main()
  .catch((error) => {
    console.error('[geo-probe] failed', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
