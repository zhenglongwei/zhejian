/**
 * GEO-OBS-C02 · 运营 Citation gap 报表
 */
const { prisma, assertGeoObsPrismaReady } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const {
  buildIntentKey,
  scoreCitationGap,
  sortCitationGaps,
  median,
  GAP_ACTION,
} = require('../utils/geo-citation-gap')

const PUBLIC_GEO_STATUSES = [GEO_PAGE_STATUS.PUBLISHED, GEO_PAGE_STATUS.NOINDEX]

function groupPublicCases(rows) {
  const map = new Map()
  for (const row of rows) {
    const city = String(row.city || '').trim()
    const service = String(row.serviceName || '').trim()
    if (!city || !service) continue
    const key = buildIntentKey(city, service)
    map.set(key, (map.get(key) || 0) + 1)
  }
  return map
}

function groupPrompts(rows) {
  const map = new Map()
  for (const row of rows) {
    if (!row.active) continue
    const city = String(row.city || '').trim()
    const service = String(row.service || '').trim()
    if (!city || !service) continue
    const key = buildIntentKey(city, service)
    const bucket = map.get(key) || {
      city,
      service,
      activePromptCount: 0,
      topicSlugs: new Set(),
      promptIds: [],
    }
    bucket.activePromptCount += 1
    if (row.topicSlug) bucket.topicSlugs.add(row.topicSlug)
    bucket.promptIds.push(row.promptId)
    map.set(key, bucket)
  }
  return map
}

function groupProbeStats(rows) {
  const map = new Map()
  for (const row of rows) {
    if (row.status !== 'ok' && row.status !== 'dry_run') continue
    const key = buildIntentKey(row.city, row.service)
    if (!key || key === '|') continue
    const bucket = map.get(key) || {
      probeMentionCount: 0,
      probeCitationCount: 0,
      usedOnlyCount: 0,
    }
    if (row.mentioned) bucket.probeMentionCount += 1
    if (row.citedUrl) bucket.probeCitationCount += 1
    if (row.mentioned && !row.citedUrl) bucket.usedOnlyCount += 1
    map.set(key, bucket)
  }
  return map
}

function buildTopicIndex(geoPages) {
  const bySlug = new Set()
  const byCityService = new Set()
  for (const page of geoPages) {
    if (page.slug) bySlug.add(page.slug)
    const city = String(page.city || '').trim()
    const serviceId = String(page.serviceId || page.relatedServiceId || '').trim()
    if (city && serviceId) byCityService.add(`${city}|${serviceId}`)
  }
  return { bySlug, byCityService }
}

/**
 * @param {{ days?: number, limit?: number }} [query]
 */
async function buildAdminCitationGaps(query = {}) {
  assertGeoObsPrismaReady()
  const days = Math.min(Math.max(Number(query.days) || 14, 1), 90)
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 50)
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)
  since.setUTCHours(0, 0, 0, 0)

  const [cases, prompts, probeResults, geoPages] = await Promise.all([
    prisma.publicCase.findMany({
      where: { status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED },
      select: { city: true, serviceName: true },
    }),
    prisma.geoPromptProbe.findMany({
      where: { active: true },
      select: {
        promptId: true,
        city: true,
        service: true,
        topicSlug: true,
        active: true,
      },
    }),
    prisma.geoPromptProbeResult.findMany({
      where: { probedAt: { gte: since } },
      select: {
        promptId: true,
        mentioned: true,
        citedUrl: true,
        status: true,
      },
    }),
    prisma.geoPage.findMany({
      where: { status: { in: PUBLIC_GEO_STATUSES } },
      select: {
        slug: true,
        city: true,
        serviceId: true,
        relatedServiceId: true,
        title: true,
        status: true,
      },
    }),
  ])

  const promptMap = new Map(prompts.map((row) => [row.promptId, row]))
  const probeRows = probeResults.map((row) => {
    const prompt = promptMap.get(row.promptId) || {}
    return {
      ...row,
      city: prompt.city || '',
      service: prompt.service || '',
    }
  })

  const caseCountMap = groupPublicCases(cases)
  const promptGroupMap = groupPrompts(prompts)
  const probeGroupMap = groupProbeStats(probeRows)
  const topicIndex = buildTopicIndex(geoPages)

  const cityMedians = new Map()
  for (const [key, count] of caseCountMap.entries()) {
    const city = key.split('|')[0]
    const list = cityMedians.get(city) || []
    list.push(count)
    cityMedians.set(city, list)
  }
  const cityMedianMap = new Map()
  for (const [city, list] of cityMedians.entries()) {
    cityMedianMap.set(city, median(list))
  }

  const keys = new Set([
    ...promptGroupMap.keys(),
    ...caseCountMap.keys(),
    ...probeGroupMap.keys(),
  ])

  const gaps = []
  for (const key of keys) {
    const promptBucket = promptGroupMap.get(key)
    const [city, service] = key.split('|')
    if (!city || !service) continue

    const publicCaseCount = caseCountMap.get(key) || 0
    const probeBucket = probeGroupMap.get(key) || {
      probeMentionCount: 0,
      probeCitationCount: 0,
      usedOnlyCount: 0,
    }
    const topicSlugs = promptBucket ? [...promptBucket.topicSlugs] : []
    const hasTopic =
      topicSlugs.some((slug) => topicIndex.bySlug.has(slug)) ||
      geoPages.some(
        (page) =>
          String(page.city || '').trim() === city &&
          String(page.title || '').includes(service)
      )

    const scored = scoreCitationGap({
      publicCaseCount,
      hasTopic,
      activePromptCount: promptBucket?.activePromptCount || 0,
      probeMentionCount: probeBucket.probeMentionCount,
      probeCitationCount: probeBucket.probeCitationCount,
      usedOnlyCount: probeBucket.usedOnlyCount,
      cityMedianCases: cityMedianMap.get(city) || 0,
    })

    gaps.push({
      city,
      service,
      publicCaseCount,
      cityMedianPublicCases: cityMedianMap.get(city) || 0,
      hasTopic,
      topicSlugs,
      activePromptCount: promptBucket?.activePromptCount || 0,
      probeMentionCount: probeBucket.probeMentionCount,
      probeCitationCount: probeBucket.probeCitationCount,
      usedOnlyCount: probeBucket.usedOnlyCount,
      ...scored,
    })
  }

  const topGaps = sortCitationGaps(
    gaps.filter((item) => item.citationGapScore > 0),
    limit
  )

  const topicMissing = topGaps.filter(
    (item) => !item.hasTopic && item.activePromptCount > 0
  )

  return {
    period: { days, since: since.toISOString(), until: new Date().toISOString() },
    metrics: {
      intent_count: gaps.length,
      high_gap_count: gaps.filter((g) => g.citationGapScore >= 30).length,
      topic_missing_count: gaps.filter((g) => !g.hasTopic && g.activePromptCount > 0).length,
      zero_case_intent_count: gaps.filter((g) => g.publicCaseCount === 0 && g.activePromptCount > 0)
        .length,
    },
    topGaps,
    topicTodos: topicMissing.slice(0, 10).map((item) => ({
      city: item.city,
      service: item.service,
      action: GAP_ACTION.TOPIC,
      citationGapScore: item.citationGapScore,
      reason: '词库有意图但无已发布专题',
    })),
    disclaimer:
      'Citation gap 基于同城同服务公开案例数、专题覆盖与内部 prompt 探测，不代表外部流量或排名。',
  }
}

module.exports = {
  buildAdminCitationGaps,
}
