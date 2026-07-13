/**
 * GEO-TOPIC-H08 / GEO-IGAIN-G03 · 专题内容健康度指标
 */
const { prisma } = require('../lib/prisma')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const { normalizeFaq } = require('../schemas/geo-page.schema')
const { scoreInformationGainText } = require('./geo-case-aggregate.service')
const { H5_SERVICE_ITEMS } = require('../constants/h5-service-items')
const { listCases } = require('./content.service')
const { getServiceItemPagePayload } = require('./h5-service-item.service')
const { computeAggregateFreshnessMetrics } = require('./geo-aggregate-refresh.service')

const PUBLIC_STATUSES = [GEO_PAGE_STATUS.PUBLISHED, GEO_PAGE_STATUS.NOINDEX]
const INFORMATION_GAIN_PATTERN = /\d+\s*例脱敏|收录\s*\d+\s*例|N\s*=\s*\d+/i

function parseIdArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

function hasInformationGainSummary(text) {
  const value = String(text || '').trim()
  if (!value) return false
  return scoreInformationGainText(value) >= 2 || INFORMATION_GAIN_PATTERN.test(value)
}

function resolvePageHealthFlags(row) {
  const faq = normalizeFaq(row.faqJson)
  const relatedCaseIds = parseIdArray(row.relatedCaseIdsJson)
  const aiSummary = String(row.aiSummary || '').trim()
  const hasInformationGain = hasInformationGainSummary(aiSummary)
  const indexable = row.status === GEO_PAGE_STATUS.PUBLISHED

  return {
    faqCount: faq.length,
    faqComplete: faq.length >= 3,
    relatedCaseCount: relatedCaseIds.length,
    hasRelatedCases: relatedCaseIds.length > 0,
    hasAiSummary: Boolean(aiSummary),
    hasInformationGain,
    indexable,
  }
}

/**
 * @returns {Promise<object>}
 */
async function computeGeoTopicHealthMetrics() {
  const rows = await prisma.geoPage.findMany({
    where: { status: { in: PUBLIC_STATUSES } },
    select: {
      status: true,
      faqJson: true,
      relatedCaseIdsJson: true,
      aiSummary: true,
    },
  })

  const published = rows.filter((row) => row.status === GEO_PAGE_STATUS.PUBLISHED)
  const enriched = published.map((row) => ({
    ...row,
    flags: resolvePageHealthFlags(row),
  }))

  const faqComplete = enriched.filter((row) => row.flags.faqComplete)
  const indexable = enriched.filter((row) => row.flags.indexable)
  const withCase = indexable.filter((row) => row.flags.hasRelatedCases)
  const withGain = indexable.filter((row) => row.flags.hasInformationGain)
  const withCaseAndGain = withCase.filter((row) => row.flags.hasInformationGain)

  return {
    published_count: published.length,
    faq_complete_count: faqComplete.length,
    topic_faq_completeness: published.length ? faqComplete.length / published.length : 0,
    indexable_count: indexable.length,
    with_case_count: withCase.length,
    topic_with_case_rate: indexable.length ? withCase.length / indexable.length : 0,
    information_gain_count: withGain.length,
    information_gain_rate: indexable.length ? withGain.length / indexable.length : 0,
    topic_with_stats_count: withCaseAndGain.length,
    topic_with_case_mounted_count: withCase.length,
    topic_with_stats_rate: withCase.length ? withCaseAndGain.length / withCase.length : 0,
  }
}

/**
 * @returns {Promise<{ metrics: object, pages: object[], serviceAudit: object }>}
 */
async function buildGeoTopicHealthReport() {
  const [rows, casesResult] = await Promise.all([
    prisma.geoPage.findMany({
      where: { status: { in: [...PUBLIC_STATUSES, GEO_PAGE_STATUS.DRAFT] } },
      select: {
        id: true,
        slug: true,
        title: true,
        pageType: true,
        city: true,
        status: true,
        aiSummary: true,
        faqJson: true,
        relatedCaseIdsJson: true,
        updatedAt: true,
        publishedAt: true,
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    }),
    listCases({ limit: 500 }),
  ])

  const pages = rows.map((row) => {
    const flags = resolvePageHealthFlags(row)
    const warnings = []
    if (flags.indexable && !flags.hasInformationGain) {
      warnings.push('已发布但摘要缺 N= 统计句')
    }
    if (flags.indexable && !flags.faqComplete) {
      warnings.push('FAQ 不足 3 条')
    }
    if (flags.indexable && !flags.hasRelatedCases) {
      warnings.push('未绑定相关案例')
    }
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      pageType: row.pageType,
      city: row.city,
      status: row.status,
      ...flags,
      warnings,
      updatedAt: row.updatedAt,
      publishedAt: row.publishedAt,
    }
  })

  const metrics = await computeGeoTopicHealthMetrics()
  const aggregateFreshness = await computeAggregateFreshnessMetrics()
  const serviceAudit = await auditServicePagesIndexability(casesResult.list || [])

  return {
    metrics: {
      ...metrics,
      aggregate_freshness: aggregateFreshness.aggregate_freshness,
      aggregate_cache_coverage: aggregateFreshness.cache_coverage,
      aggregate_fresh_count: aggregateFreshness.fresh,
      aggregate_cache_count: aggregateFreshness.withCache,
      published_target: 50,
      published_target_met: metrics.published_count >= 50,
    },
    pages: pages.filter((row) => row.status !== GEO_PAGE_STATUS.DRAFT).slice(0, 200),
    draftCount: pages.filter((row) => row.status === GEO_PAGE_STATUS.DRAFT).length,
    warningPages: pages
      .filter((row) => row.status === GEO_PAGE_STATUS.PUBLISHED && row.warnings.length)
      .slice(0, 30),
    serviceAudit,
    disclaimer:
      '健康度基于 geo_pages 已发布内容与摘要规则计算；information_gain_rate 指摘要含案例统计句占比，不代表外部引用。',
  }
}

/**
 * GEO-IGAIN-G04 · 无案例服务页 noindex 审计
 * @param {object[]} _cases
 */
async function auditServicePagesIndexability(_cases = []) {
  const violations = []
  let indexableCount = 0
  let noindexCount = 0

  for (const item of H5_SERVICE_ITEMS) {
    try {
      const payload = await getServiceItemPagePayload(item.slug)
      const caseCount = payload.stats?.caseCount || 0
      const allowIndex = Boolean(payload.seo?.allowIndex)
      if (allowIndex) indexableCount += 1
      else noindexCount += 1
      if (caseCount === 0 && allowIndex) {
        violations.push({
          slug: item.slug,
          name: item.name,
          caseCount,
          allowIndex,
          reason: '无公开案例但仍 allowIndex',
        })
      }
    } catch (error) {
      violations.push({
        slug: item.slug,
        name: item.name,
        caseCount: null,
        allowIndex: null,
        reason: error.message || '加载失败',
      })
    }
  }

  return {
    serviceCount: H5_SERVICE_ITEMS.length,
    indexableCount,
    noindexCount,
    violationCount: violations.length,
    passed: violations.length === 0,
    violations,
  }
}

module.exports = {
  hasInformationGainSummary,
  resolvePageHealthFlags,
  computeGeoTopicHealthMetrics,
  buildGeoTopicHealthReport,
  auditServicePagesIndexability,
}
