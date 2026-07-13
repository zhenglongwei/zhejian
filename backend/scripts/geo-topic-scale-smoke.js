/**
 * GEO-TOPIC-H09 · 已发布专题规模冒烟（≥50）
 */
require('dotenv').config()
const { prisma } = require('../src/lib/prisma')
const { GEO_PAGE_STATUS } = require('../src/constants/geo-page-status')
const { computeGeoTopicHealthMetrics } = require('../src/services/geo-topic-health.service')
const { GEO_TOPIC_SEED_ALL } = require('../src/constants/geo-topic-seed-list')
const { syncGeoPromptSeeds } = require('../src/services/geo-prompt-probe.service')

const MIN_PUBLISHED = Number(process.env.GEO_TOPIC_MIN_PUBLISHED || 50)

async function main() {
  const published = await prisma.geoPage.count({
    where: { status: GEO_PAGE_STATUS.PUBLISHED },
  })
  if (published < MIN_PUBLISHED) {
    throw new Error(`已发布专题 ${published} < ${MIN_PUBLISHED}`)
  }

  const metrics = await computeGeoTopicHealthMetrics()
  if (metrics.information_gain_rate < 0.5) {
    console.warn(
      '[geo-topic-scale-smoke] warn information_gain_rate',
      `${Math.round(metrics.information_gain_rate * 100)}%`
    )
  }

  const prompts = await syncGeoPromptSeeds()
  console.log('[geo-topic-scale-smoke] ok', {
    published,
    seedCount: GEO_TOPIC_SEED_ALL.length,
    promptSeedTotal: prompts.total,
    promptCreated: prompts.created,
    promptUpdated: prompts.updated,
    information_gain_rate: Math.round(metrics.information_gain_rate * 100),
    topic_faq_completeness: Math.round(metrics.topic_faq_completeness * 100),
  })
}

main()
  .catch((error) => {
    console.error('[geo-topic-scale-smoke] ❌', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
