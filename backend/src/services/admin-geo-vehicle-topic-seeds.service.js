/**
 * GEO-TOPIC-E · 运营车型选题雷达（只读 seed，不自动发布）
 */
const { prisma, assertGeoObsPrismaReady } = require('../lib/prisma')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const { listCases } = require('./content.service')
const {
  discoverVehicleSeriesTopicSeeds,
  MIN_VEHICLE_TOPIC_SAMPLE,
} = require('./geo-vehicle-topic.service')
const { generateVehicleSeriesDrafts } = require('./geo-page-generator.service')
const { createAdminGeoPage } = require('./admin-geo-page.service')

function mapSeedRow(seed, options = {}) {
  const { pageBySlug = new Map(), draftBySlug = new Map() } = options
  const slug = seed.slug || ''
  const page = pageBySlug.get(slug)
  const draft = draftBySlug.get(slug)
  const caseCount = Array.isArray(seed.relatedCaseIds) ? seed.relatedCaseIds.length : 0
  const hasTopic = Boolean(page)
  const topicStatus = page ? page.status : ''
  let recommendedAction = 'create_draft'
  if (hasTopic && topicStatus === GEO_PAGE_STATUS.PUBLISHED) {
    recommendedAction = 'published'
  } else if (hasTopic) {
    recommendedAction = 'edit_draft'
  }

  return {
    slug,
    title: seed.title || '',
    pageType: seed.pageType || '',
    vehicleSeries: seed.vehicleSeries || '',
    serviceItemId: seed.serviceItemId || '',
    serviceName: seed.serviceName || draft?.title || '',
    caseCount,
    relatedCaseIds: seed.relatedCaseIds || [],
    keywords: seed.keywords || [],
    hasTopic,
    topicStatus,
    recommendedAction,
    draftPreview: draft
      ? {
          aiSummary: draft.aiSummary || '',
          faqCount: Array.isArray(draft.faq) ? draft.faq.length : 0,
          matchedCaseCount: Array.isArray(draft.relatedCaseIds) ? draft.relatedCaseIds.length : caseCount,
        }
      : null,
  }
}

/**
 * @param {{ minSample?: number, limit?: number }} [query]
 */
async function buildAdminVehicleTopicSeeds(query = {}) {
  assertGeoObsPrismaReady()
  const minSample =
    query.minSample != null
      ? Math.max(2, Number(query.minSample) || MIN_VEHICLE_TOPIC_SAMPLE)
      : MIN_VEHICLE_TOPIC_SAMPLE
  const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100)

  const { list: cases } = await listCases({ limit: 500 })
  const seeds = discoverVehicleSeriesTopicSeeds(cases, { minSample })
  if (!seeds.length) {
    return {
      disclaimer:
        '车型选题雷达仅统计已发布公开案例，达到样本阈值后供运营人工建专题；不会自动发布。',
      minSample,
      metrics: {
        seedCount: 0,
        missingTopicCount: 0,
        publishedTopicCount: 0,
      },
      seeds: [],
    }
  }

  const slugs = seeds.map((seed) => seed.slug).filter(Boolean)
  const geoPages = slugs.length
    ? await prisma.geoPage.findMany({
        where: { slug: { in: slugs } },
        select: { slug: true, status: true, title: true, id: true },
      })
    : []
  const pageBySlug = new Map(geoPages.map((row) => [row.slug, row]))

  const drafts = generateVehicleSeriesDrafts(cases, { minSample })
  const draftBySlug = new Map(drafts.map((draft) => [draft.slug, draft]))

  const rows = seeds
    .map((seed) => mapSeedRow(seed, { pageBySlug, draftBySlug }))
    .sort((a, b) => b.caseCount - a.caseCount || a.slug.localeCompare(b.slug))
    .slice(0, limit)

  const missingTopicCount = rows.filter((row) => !row.hasTopic).length
  const publishedTopicCount = rows.filter(
    (row) => row.topicStatus === GEO_PAGE_STATUS.PUBLISHED
  ).length

  return {
    disclaimer:
      '车型选题雷达仅统计已发布公开案例，达到样本阈值后供运营人工建专题；不会自动发布。',
    minSample,
    metrics: {
      seedCount: rows.length,
      missingTopicCount,
      publishedTopicCount,
    },
    seeds: rows,
  }
}

/**
 * 从 seed slug 创建 GEO 专题草稿（人工确认后再发布）
 * @param {string} slug
 */
async function createAdminGeoPageDraftFromVehicleSeed(slug) {
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

  const { list: cases } = await listCases({ limit: 500 })
  const seeds = discoverVehicleSeriesTopicSeeds(cases, { minSample: 2 })
  const seed = seeds.find((item) => item.slug === normalized)
  if (!seed) {
    const err = new Error('未找到匹配的车型选题 seed')
    err.status = 404
    throw err
  }

  const [draft] = generateVehicleSeriesDrafts(cases, { minSample: 2 }).filter(
    (item) => item.slug === normalized
  )
  if (!draft) {
    const err = new Error('无法生成专题草稿')
    err.status = 500
    throw err
  }

  return createAdminGeoPage({
    ...draft,
    status: GEO_PAGE_STATUS.DRAFT,
  })
}

module.exports = {
  buildAdminVehicleTopicSeeds,
  createAdminGeoPageDraftFromVehicleSeed,
}
