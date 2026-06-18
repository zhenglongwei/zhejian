/**
 * GEO-TOPIC-M02/M03 · 专题内容健康度指标
 */
const { prisma } = require('../lib/prisma')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const { normalizeFaq } = require('../schemas/geo-page.schema')

const PUBLIC_STATUSES = [GEO_PAGE_STATUS.PUBLISHED, GEO_PAGE_STATUS.NOINDEX]

function parseIdArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

/**
 * @returns {Promise<{
 *   published_count: number,
 *   faq_complete_count: number,
 *   topic_faq_completeness: number,
 *   indexable_count: number,
 *   with_case_count: number,
 *   topic_with_case_rate: number,
 * }>}
 */
async function computeGeoTopicHealthMetrics() {
  const rows = await prisma.geoPage.findMany({
    where: { status: { in: PUBLIC_STATUSES } },
    select: {
      status: true,
      faqJson: true,
      relatedCaseIdsJson: true,
    },
  })

  const published = rows.filter((row) => row.status === GEO_PAGE_STATUS.PUBLISHED)
  const faqComplete = published.filter((row) => normalizeFaq(row.faqJson).length >= 3)
  const indexable = published.filter((row) => row.status !== GEO_PAGE_STATUS.NOINDEX)
  const withCase = indexable.filter((row) => parseIdArray(row.relatedCaseIdsJson).length > 0)

  return {
    published_count: published.length,
    faq_complete_count: faqComplete.length,
    topic_faq_completeness: published.length ? faqComplete.length / published.length : 0,
    indexable_count: indexable.length,
    with_case_count: withCase.length,
    topic_with_case_rate: indexable.length ? withCase.length / indexable.length : 0,
  }
}

module.exports = {
  computeGeoTopicHealthMetrics,
}
