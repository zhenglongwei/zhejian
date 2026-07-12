const assert = require('assert')
const { GAP_ACTION } = require('../utils/geo-citation-gap')
const {
  isTopicCreationGap,
  seedMatchesGap,
  findSeedsForGap,
  buildGapTopicRecommendations,
} = require('./geo-gap-topic-recommend.service')

function run() {
  const gap = {
    city: '杭州',
    service: '刹车片更换',
    citationGapScore: 45,
    publicCaseCount: 1,
    hasTopic: false,
    activePromptCount: 1,
    topicSlugs: ['hangzhou-brake-pad'],
    recommendedAction: GAP_ACTION.TOPIC,
  }
  const seed = {
    slug: 'hangzhou-brake-pad',
    pageType: 'city_service',
    city: '杭州',
    serviceName: '刹车片更换',
    serviceItemId: 'item_brake_pad',
    promptId: 'prompt_hz_brake_pad',
  }

  assert.strictEqual(isTopicCreationGap(gap), true)
  assert.strictEqual(seedMatchesGap(seed, gap), true)

  const matched = findSeedsForGap(gap, [seed])
  assert.strictEqual(matched.length, 1)
  assert.strictEqual(matched[0].slug, 'hangzhou-brake-pad')

  const recommendations = buildGapTopicRecommendations({
    gaps: [gap],
    seeds: [seed],
    pageBySlug: new Map(),
    allCases: [
      {
        id: 'case_1',
        city: '杭州',
        serviceName: '刹车片更换',
        inspectResult: '片厚不足',
        repairPlan: '更换刹车片',
      },
    ],
    limit: 5,
  })
  assert.strictEqual(recommendations.length, 1)
  assert.strictEqual(recommendations[0].slug, 'hangzhou-brake-pad')
  assert.strictEqual(recommendations[0].recommendedAction, 'create_draft')
  assert.ok(recommendations[0].draftPreview)

  const published = buildGapTopicRecommendations({
    gaps: [gap],
    seeds: [seed],
    pageBySlug: new Map([['hangzhou-brake-pad', { slug: 'hangzhou-brake-pad', status: 'published' }]]),
    allCases: [],
    limit: 5,
  })
  assert.strictEqual(published.length, 0)

  console.log('[geo-gap-topic-recommend.test] ok')
}

run()
