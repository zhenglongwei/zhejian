/**
 * GEO 生产环境诊断：种子入库 / 发布 / 覆盖率缺口
 */
require('dotenv').config()
const { prisma } = require('../src/lib/prisma')
const { GEO_TOPIC_SEED_ALL } = require('../src/constants/geo-topic-seed-list')
const { GEO_PAGE_STATUS } = require('../src/constants/geo-page-status')
const { computeGeoTopicHealthMetrics } = require('../src/services/geo-topic-health.service')
const { listCases } = require('../src/services/content.service')

async function main() {
  const seedSlugs = GEO_TOPIC_SEED_ALL.map((seed) => seed.slug)
  const pages = await prisma.geoPage.findMany({
    where: { slug: { in: seedSlugs } },
    select: { slug: true, status: true, aiSummary: true },
  })
  const pageBySlug = new Map(pages.map((row) => [row.slug, row]))

  const missing = []
  const draftOnly = []
  const published = []
  const emptySummary = []

  seedSlugs.forEach((slug) => {
    const row = pageBySlug.get(slug)
    if (!row) {
      missing.push(slug)
      return
    }
    if (row.status === GEO_PAGE_STATUS.PUBLISHED) {
      published.push(slug)
      if (!String(row.aiSummary || '').trim()) emptySummary.push(slug)
    } else {
      draftOnly.push(slug)
    }
  })

  const { list: cases } = await listCases({ limit: 500 })
  const metrics = await computeGeoTopicHealthMetrics()
  const allPublished = await prisma.geoPage.count({
    where: { status: GEO_PAGE_STATUS.PUBLISHED },
  })

  console.log('[geo-production-status]', {
    seedTotal: seedSlugs.length,
    seedInDb: pages.length,
    seedMissing: missing.length,
    seedDraftOnly: draftOnly.length,
    seedPublished: published.length,
    allPublishedPages: allPublished,
    publicCases: cases.length,
    prompt_intent_coverage_est: `${Math.round((published.length / seedSlugs.length) * 100)}%`,
    information_gain_rate: Math.round(metrics.information_gain_rate * 100),
    emptyAiSummaryPublished: emptySummary.length,
  })

  if (missing.length) {
    console.log('[geo-production-status] missing slugs (sample):', missing.slice(0, 10))
  }
  if (draftOnly.length) {
    console.log('[geo-production-status] draft-only slugs (sample):', draftOnly.slice(0, 10))
  }
  if (emptySummary.length) {
    console.log('[geo-production-status] published but empty aiSummary (sample):', emptySummary.slice(0, 10))
  }

  if (missing.length > 0) {
    console.log('\n→ 先执行: npm run geo:batch-draft  （需已拉取 slug 修复）')
  } else if (draftOnly.length > 0) {
    console.log('\n→ 覆盖率只计已发布；执行: npm run geo:batch-draft:publish')
  }
  if (emptySummary.length > 0 || metrics.information_gain_rate < 0.5) {
    console.log('→ 补 N= 统计: npm run geo:aggregate-refresh')
  }
}

main()
  .catch((error) => {
    console.error('[geo-production-status] ❌', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
