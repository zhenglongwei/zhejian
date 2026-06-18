/**
 * GEO-OBS-B06 · 手动触发 Prompt 探测
 *   npm run geo:probe
 *   node scripts/geo-prompt-probe.js --dry-run
 */
require('dotenv').config()
const { runGeoPromptProbeBatch, buildGeoProbeReport } = require('../src/services/geo-prompt-probe.service')
const { prisma } = require('../src/lib/prisma')

async function main() {
  const live = process.argv.includes('--live')
  if (!live) {
    process.env.GEO_PROBE_DRY_RUN = 'true'
  }

  const result = await runGeoPromptProbeBatch({
    limit: process.argv.find((item) => item.startsWith('--limit='))?.split('=')[1],
  })
  const report = await buildGeoProbeReport({ days: 7 })
  console.log('[geo-probe]', {
    processed: result.processed,
    dryRun: result.dryRun,
    metrics: report.metrics,
  })
}

main()
  .catch((error) => {
    console.error('[geo-probe] failed', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
