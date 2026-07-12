/**
 * GEO-TOPIC-H02 · 运营 Gap 专题推荐 API
 */
const { prisma, assertGeoObsPrismaReady } = require('../lib/prisma')
const { GEO_TOPIC_SEED_ALL } = require('../constants/geo-topic-seed-list')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const { buildAdminCitationGaps } = require('./admin-geo-citation-gap.service')
const { listCases } = require('./content.service')
const {
  buildGapTopicRecommendations,
  findSeedBySlug,
} = require('./geo-gap-topic-recommend.service')
const { generateGeoPageDraft } = require('./geo-page-generator.service')
const { createAdminGeoPage } = require('./admin-geo-page.service')

/**
 * @param {{ days?: number, limit?: number }} [query]
 */
async function buildAdminGapTopicRecommendations(query = {}) {
  assertGeoObsPrismaReady()
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 30)
  const days = Math.min(Math.max(Number(query.days) || 14, 1), 90)

  const [gapReport, casesResult, geoPages] = await Promise.all([
    buildAdminCitationGaps({ days, limit: 30 }),
    listCases({ limit: 500 }),
    prisma.geoPage.findMany({
      select: { id: true, slug: true, status: true, title: true },
    }),
  ])

  const pageBySlug = new Map(geoPages.map((row) => [row.slug, row]))
  const recommendations = buildGapTopicRecommendations({
    gaps: gapReport.topGaps || [],
    seeds: GEO_TOPIC_SEED_ALL,
    pageBySlug,
    allCases: casesResult.list || [],
    limit,
  })

  const createDraftCount = recommendations.filter(
    (row) => row.recommendedAction === 'create_draft'
  ).length
  const editDraftCount = recommendations.filter(
    (row) => row.recommendedAction === 'edit_draft'
  ).length

  return {
    period: gapReport.period,
    disclaimer:
      'Gap 专题推荐基于 citation gap、OBS 词库种子与公开案例匹配生成，仅供运营人工确认后建草稿；不会自动发布。',
    metrics: {
      recommendationCount: recommendations.length,
      createDraftCount,
      editDraftCount,
      topicMissingCount: gapReport.metrics?.topic_missing_count || 0,
      highGapCount: gapReport.metrics?.high_gap_count || 0,
    },
    recommendations,
    sourceGaps: (gapReport.topGaps || []).filter((gap) => gap.recommendedAction === 'T+').slice(0, 10),
  }
}

/**
 * @param {string} slug
 */
async function createAdminGeoPageDraftFromGapRecommendation(slug) {
  assertGeoObsPrismaReady()
  const normalized = String(slug || '').trim()
  if (!normalized) {
    const err = new Error('slug 不能为空')
    err.status = 400
    throw err
  }

  const existing = await prisma.geoPage.findFirst({
    where: { slug: normalized },
    select: { id: true, slug: true, status: true },
  })
  if (existing) {
    const err = new Error('该 slug 专题已存在')
    err.status = 409
    err.data = existing
    throw err
  }

  const seed = findSeedBySlug(normalized)
  if (!seed) {
    const err = new Error('未找到匹配的 Gap 专题 seed')
    err.status = 404
    throw err
  }

  const { list: cases } = await listCases({ limit: 500 })
  const draft = generateGeoPageDraft(seed, { allCases: cases })
  return createAdminGeoPage({
    ...draft,
    status: GEO_PAGE_STATUS.DRAFT,
  })
}

module.exports = {
  buildAdminGapTopicRecommendations,
  createAdminGeoPageDraftFromGapRecommendation,
}
