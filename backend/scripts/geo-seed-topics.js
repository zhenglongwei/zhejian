/**
 * GEO-TOPIC-D03 / GEO-TOPIC-H04 · 种子词库批量入库
 *
 * 用法：
 *   node scripts/geo-seed-topics.js              # draft 模式（默认，不降级已发布）
 *   node scripts/geo-seed-topics.js --publish    # 强制发布
 *   node scripts/geo-seed-topics.js --content-only
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const {
  BATCH_DRAFT_MODE,
  batchUpsertGeoPageDrafts,
} = require('../src/services/geo-batch-draft.service')

const prisma = new PrismaClient()
const argv = process.argv.slice(2)

function resolveMode() {
  if (argv.includes('--publish')) return BATCH_DRAFT_MODE.PUBLISH
  if (argv.includes('--content-only')) return BATCH_DRAFT_MODE.CONTENT_ONLY
  return BATCH_DRAFT_MODE.DRAFT
}

async function main() {
  const mode = resolveMode()
  const result = await batchUpsertGeoPageDrafts({ mode, client: prisma })

  console.log(
    `[geo-seed-topics] drafts=${result.draftCount} withAggregateSummary=${result.withAggregateSummary} cases=${result.caseCount}`
  )
  console.log(
    `[geo-seed-topics] done total=${result.draftCount} created=${result.created} updated=${result.updated} skipped=${result.skipped} preservedPublished=${result.preservedPublished} mode=${mode}`
  )
}

main()
  .catch((e) => {
    console.error('[geo-seed-topics] failed', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
