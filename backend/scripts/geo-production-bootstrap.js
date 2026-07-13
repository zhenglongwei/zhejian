/**
 * GEO 生产环境一键收口：入库 → 发布 → 词库同步 → 聚合刷新
 *
 * 用法：
 *   node scripts/geo-production-bootstrap.js
 *   node scripts/geo-production-bootstrap.js --skip-publish   # 仅 draft，不提升覆盖率
 */
require('dotenv').config()
const { prisma } = require('../src/lib/prisma')
const {
  BATCH_DRAFT_MODE,
  batchUpsertGeoPageDrafts,
} = require('../src/services/geo-batch-draft.service')
const { syncGeoPromptSeeds } = require('../src/services/geo-prompt-probe.service')
const { refreshAllGeoPageAggregates } = require('../src/services/geo-aggregate-refresh.service')

const SKIP_PUBLISH = process.argv.includes('--skip-publish')

async function main() {
  console.log('[geo-production-bootstrap] step 1/4 batch draft (create missing, refresh content)')
  const draftResult = await batchUpsertGeoPageDrafts({ mode: BATCH_DRAFT_MODE.DRAFT })
  console.log('[geo-production-bootstrap]', draftResult)

  let publishResult = null
  if (!SKIP_PUBLISH) {
    console.log('[geo-production-bootstrap] step 2/4 publish seed topics (coverage 只计已发布)')
    publishResult = await batchUpsertGeoPageDrafts({ mode: BATCH_DRAFT_MODE.PUBLISH })
    console.log('[geo-production-bootstrap]', publishResult)
  } else {
    console.log('[geo-production-bootstrap] step 2/4 skipped (--skip-publish)')
  }

  console.log('[geo-production-bootstrap] step 3/4 probe seed sync')
  const promptResult = await syncGeoPromptSeeds()
  console.log('[geo-production-bootstrap]', promptResult)

  console.log('[geo-production-bootstrap] step 4/4 aggregate refresh')
  const aggregateResult = await refreshAllGeoPageAggregates()
  console.log('[geo-production-bootstrap]', {
    total: aggregateResult.total,
    applied: aggregateResult.applied,
    skipped: aggregateResult.skipped,
    unchanged: aggregateResult.unchanged,
    errors: aggregateResult.errors,
  })

  console.log('[geo-production-bootstrap] done', {
    created: draftResult.created,
    updated: draftResult.updated,
    publishedSet: publishResult?.publishedSet ?? 0,
    prompts: promptResult.total,
    aggregateApplied: aggregateResult.applied,
  })
}

main()
  .catch((error) => {
    console.error('[geo-production-bootstrap] ❌', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
