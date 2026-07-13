/**
 * GEO-TOPIC-H04 · 批量 draft 冒烟
 */
require('dotenv').config()
const { prisma } = require('../src/lib/prisma')
const { GEO_TOPIC_SEED_ALL } = require('../src/constants/geo-topic-seed-list')
const { GEO_PAGE_STATUS } = require('../src/constants/geo-page-status')
const { batchUpsertGeoPageDrafts } = require('../src/services/geo-batch-draft.service')

const MIN_SEEDS = Number(process.env.GEO_BATCH_DRAFT_MIN_SEEDS || 100)

async function main() {
  if (GEO_TOPIC_SEED_ALL.length < MIN_SEEDS) {
    throw new Error(`种子词库 ${GEO_TOPIC_SEED_ALL.length} < ${MIN_SEEDS}`)
  }

  const publishedBefore = await prisma.geoPage.count({
    where: { status: GEO_PAGE_STATUS.PUBLISHED },
  })

  const dryRun = await batchUpsertGeoPageDrafts({ dryRun: true })
  if (dryRun.draftCount < MIN_SEEDS || dryRun.missingFaq > 0) {
    throw new Error('dry-run 生成结果不达标')
  }

  const result = await batchUpsertGeoPageDrafts()
  const publishedAfter = await prisma.geoPage.count({
    where: { status: GEO_PAGE_STATUS.PUBLISHED },
  })

  if (publishedAfter < publishedBefore) {
    throw new Error(
      `draft 模式不应降级已发布专题：${publishedBefore} → ${publishedAfter}`
    )
  }

  const draftCount = await prisma.geoPage.count({
    where: {
      slug: { in: GEO_TOPIC_SEED_ALL.map((seed) => seed.slug) },
    },
  })

  if (draftCount < MIN_SEEDS) {
    throw new Error(`DB 种子专题 ${draftCount} < ${MIN_SEEDS}`)
  }

  console.log('[geo-batch-draft-smoke] ok', {
    seedCount: GEO_TOPIC_SEED_ALL.length,
    publishedBefore,
    publishedAfter,
    dbSeedTopics: draftCount,
    ...result,
  })
}

main()
  .catch((error) => {
    console.error('[geo-batch-draft-smoke] ❌', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
