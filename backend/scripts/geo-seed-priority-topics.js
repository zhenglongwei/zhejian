/**
 * 发布首批用户常搜意图专题（杭州小保养 / 刹车片 / 电瓶）
 *
 *   node scripts/geo-seed-priority-topics.js
 *   node scripts/geo-seed-priority-topics.js --dry-run
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { GEO_TOPIC_SEED_LIST } = require('../src/constants/geo-topic-seed-list')
const {
  BATCH_DRAFT_MODE,
  batchUpsertGeoPageDrafts,
} = require('../src/services/geo-batch-draft.service')

const PRIORITY_SLUGS = [
  'hangzhou-car-maintenance',
  'hangzhou-brake-pad',
  'hangzhou-battery-replacement',
]

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

async function main() {
  const seeds = GEO_TOPIC_SEED_LIST.filter((item) => PRIORITY_SLUGS.includes(item.slug))
  if (seeds.length !== PRIORITY_SLUGS.length) {
    throw new Error(`优先专题种子不完整：${seeds.map((item) => item.slug).join(',')}`)
  }
  seeds.forEach((seed) => {
    if (!Array.isArray(seed.faq) || seed.faq.length < 5) {
      throw new Error(`${seed.slug} FAQ 不足 5 条`)
    }
  })

  const result = await batchUpsertGeoPageDrafts({
    seeds,
    mode: BATCH_DRAFT_MODE.PUBLISH,
    dryRun,
    client: prisma,
  })
  console.log('[geo-seed-priority-topics]', {
    dryRun,
    slugs: PRIORITY_SLUGS,
    created: result.created,
    updated: result.updated,
    publishedSet: result.publishedSet,
  })
}

main()
  .catch((error) => {
    console.error('[geo-seed-priority-topics] failed', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
