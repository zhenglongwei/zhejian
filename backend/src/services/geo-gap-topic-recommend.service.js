/**
 * GEO-TOPIC-H02 · Citation gap → 意图专题推荐（规则匹配，不自动发布）
 */
const { GEO_TOPIC_SEED_ALL } = require('../constants/geo-topic-seed-list')
const { GAP_ACTION } = require('../utils/geo-citation-gap')
const { matchServiceName } = require('../utils/service-case-link')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const { generateGeoPageDraft } = require('./geo-page-generator.service')
const { filterCasesForGeoPage, buildPseudoPageFromSeed } = require('../utils/geo-topic-matcher')
const { resolveH5ServiceItemById } = require('../constants/h5-service-items')

const PAGE_TYPE_PRIORITY = {
  city_service: 4,
  city_fault: 3,
  fault_qa: 2,
  vehicle_service: 1,
}

function isTopicCreationGap(gap) {
  if (!gap) return false
  if (gap.recommendedAction === GAP_ACTION.TOPIC) return true
  return !gap.hasTopic && Number(gap.activePromptCount) > 0
}

function seedMatchesGap(seed, gap) {
  if (!seed || !gap) return false
  const gapCity = String(gap.city || '').trim()
  const gapService = String(gap.service || '').trim()
  const seedCity = String(seed.city || '').trim()
  const seedService = String(seed.serviceName || '').trim()

  if (Array.isArray(gap.topicSlugs) && gap.topicSlugs.includes(seed.slug)) {
    return true
  }

  if (!gapService || !seedService) return false
  if (!matchServiceName(gapService, seedService)) return false

  if (seed.pageType === 'city_service' || seed.pageType === 'city_fault') {
    if (!seedCity || !gapCity) return false
    return seedCity === gapCity
  }

  if (seed.pageType === 'fault_qa') {
    return true
  }

  return false
}

function findSeedsForGap(gap, seeds = GEO_TOPIC_SEED_ALL) {
  return (seeds || [])
    .filter((seed) => seedMatchesGap(seed, gap))
    .sort((a, b) => {
      const priorityDiff =
        (PAGE_TYPE_PRIORITY[b.pageType] || 0) - (PAGE_TYPE_PRIORITY[a.pageType] || 0)
      if (priorityDiff !== 0) return priorityDiff
      return String(a.slug).localeCompare(String(b.slug))
    })
}

function resolveGeoPageBySlug(slug, pageBySlug = new Map()) {
  return pageBySlug.get(slug) || null
}

function resolveRecommendedAction(page) {
  if (!page) return 'create_draft'
  if (page.status === GEO_PAGE_STATUS.PUBLISHED) return 'published'
  return 'edit_draft'
}

function countMatchedCases(seed, allCases = []) {
  const serviceItem = resolveH5ServiceItemById(seed.serviceItemId)
  if (!serviceItem || !allCases.length) return 0
  const pseudoPage = buildPseudoPageFromSeed(seed, serviceItem)
  return filterCasesForGeoPage(pseudoPage, allCases, { serviceItem }).length
}

/**
 * @param {object} input
 * @param {object[]} input.gaps
 * @param {object[]} [input.seeds]
 * @param {Map<string, object>} [input.pageBySlug]
 * @param {object[]} [input.allCases]
 * @param {number} [input.limit]
 */
function buildGapTopicRecommendations(input = {}) {
  const seeds = input.seeds || GEO_TOPIC_SEED_ALL
  const pageBySlug = input.pageBySlug || new Map()
  const allCases = input.allCases || []
  const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 30)

  const candidates = []
  const seenSlug = new Set()

  for (const gap of input.gaps || []) {
    if (!isTopicCreationGap(gap)) continue
    const matchedSeeds = findSeedsForGap(gap, seeds)
    for (const seed of matchedSeeds) {
      if (!seed.slug || seenSlug.has(seed.slug)) continue
      const page = resolveGeoPageBySlug(seed.slug, pageBySlug)
      const recommendedAction = resolveRecommendedAction(page)
      if (recommendedAction === 'published') continue

      const matchedCaseCount = countMatchedCases(seed, allCases)
      let draftPreview = null
      try {
        const draft = generateGeoPageDraft(seed, { allCases })
        draftPreview = {
          title: draft.title || seed.title || '',
          aiSummary: draft.aiSummary || '',
          faqCount: Array.isArray(draft.faq) ? draft.faq.length : 0,
          matchedCaseCount,
          hasInformationGain: Boolean(
            String(draft.aiSummary || '').match(/\d+\s*例脱敏|收录\s*\d+\s*例/)
          ),
        }
      } catch (_error) {
        draftPreview = {
          title: seed.title || '',
          aiSummary: '',
          faqCount: Array.isArray(seed.faq) ? seed.faq.length : 0,
          matchedCaseCount,
          hasInformationGain: false,
        }
      }

      candidates.push({
        slug: seed.slug,
        title: seed.title || draftPreview.title,
        pageType: seed.pageType,
        city: seed.city || gap.city || '',
        serviceName: seed.serviceName || gap.service || '',
        faultTag: seed.faultTag || '',
        promptId: seed.promptId || '',
        promptType: seed.promptType || '',
        citationGapScore: gap.citationGapScore || 0,
        publicCaseCount: gap.publicCaseCount || 0,
        probeCitationCount: gap.probeCitationCount || 0,
        probeMentionCount: gap.probeMentionCount || 0,
        gapCity: gap.city || '',
        gapService: gap.service || '',
        matchedCaseCount,
        hasTopic: Boolean(page),
        topicStatus: page?.status || '',
        topicId: page?.id || '',
        recommendedAction,
        reason: page
          ? '已有草稿，建议补齐案例统计后发布'
          : 'Citation gap 命中且词库有意图专题模板',
        draftPreview,
      })
      seenSlug.add(seed.slug)
    }
  }

  return candidates
    .sort(
      (a, b) =>
        b.citationGapScore - a.citationGapScore ||
        b.matchedCaseCount - a.matchedCaseCount ||
        a.slug.localeCompare(b.slug)
    )
    .slice(0, limit)
}

function findSeedBySlug(slug, seeds = GEO_TOPIC_SEED_ALL) {
  const normalized = String(slug || '').trim()
  if (!normalized) return null
  return seeds.find((seed) => seed.slug === normalized) || null
}

module.exports = {
  isTopicCreationGap,
  seedMatchesGap,
  findSeedsForGap,
  buildGapTopicRecommendations,
  findSeedBySlug,
}
