/**
 * GEO-AGG-11 · 日级 GEO 专题聚合重算
 *
 * 用法：
 *   node scripts/geo-aggregate-daily-refresh.js
 *   node scripts/geo-aggregate-daily-refresh.js --dry-run
 *   node scripts/geo-aggregate-daily-refresh.js --slug hangzhou-brake-pad
 */
require('dotenv').config()
const { prisma } = require('../src/lib/prisma')
const {
  refreshAllGeoPageAggregates,
  computeAggregateFreshnessMetrics,
} = require('../src/services/geo-aggregate-refresh.service')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const slugArg = args.find((item) => item.startsWith('--slug='))
const limitArg = args.find((item) => item.startsWith('--limit='))
const slug = slugArg ? slugArg.split('=').slice(1).join('=') : ''
const limit = limitArg ? Number(limitArg.split('=')[1]) : 0

async function main() {
  const summary = await refreshAllGeoPageAggregates({
    dryRun,
    slug: slug || undefined,
    limit: limit > 0 ? limit : undefined,
  })
  const freshness = await computeAggregateFreshnessMetrics()

  console.log('[geo-aggregate-daily-refresh] done', {
    dryRun: summary.dryRun,
    total: summary.total,
    applied: summary.applied,
    unchanged: summary.unchanged,
    skipped: summary.skipped,
    errors: summary.errors,
    aggregate_freshness: Math.round(freshness.aggregate_freshness * 100),
    cache_coverage: Math.round(freshness.cache_coverage * 100),
  })

  if (summary.errors > 0) {
    throw new Error(`聚合重算失败 ${summary.errors} 条`)
  }
}

main()
  .catch((error) => {
    console.error('[geo-aggregate-daily-refresh] ❌', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
