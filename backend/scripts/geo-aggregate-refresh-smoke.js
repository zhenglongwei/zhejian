/**
 * GEO-AGG-11 · 日级聚合重算冒烟
 */
require('dotenv').config()
const assert = require('assert')
const { prisma } = require('../src/lib/prisma')
const { GEO_PAGE_STATUS } = require('../src/constants/geo-page-status')
const {
  refreshAllGeoPageAggregates,
  computeAggregateFreshnessMetrics,
} = require('../src/services/geo-aggregate-refresh.service')

async function main() {
  const before = await computeAggregateFreshnessMetrics()
  const summary = await refreshAllGeoPageAggregates({ limit: 20 })
  const after = await computeAggregateFreshnessMetrics()

  assert.ok(summary.total >= 1, '应有可重算专题')
  assert.strictEqual(summary.errors, 0, '重算不应报错')

  const published = await prisma.geoPage.count({
    where: { status: GEO_PAGE_STATUS.PUBLISHED },
  })

  console.log('[geo-aggregate-refresh-smoke] ok', {
    published,
    refreshedTotal: summary.total,
    applied: summary.applied,
    unchanged: summary.unchanged,
    skipped: summary.skipped,
    aggregate_freshness_before: Math.round(before.aggregate_freshness * 100),
    aggregate_freshness_after: Math.round(after.aggregate_freshness * 100),
    cache_coverage_after: Math.round(after.cache_coverage * 100),
  })
}

main()
  .catch((error) => {
    console.error('[geo-aggregate-refresh-smoke] ❌', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
