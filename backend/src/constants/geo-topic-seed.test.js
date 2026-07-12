/**
 * GEO-TOPIC-D · 种子清单与生成器冒烟
 * 运行：node src/constants/geo-topic-seed.test.js
 */
const assert = require('assert')
const { GEO_TOPIC_SEED_LIST, GEO_TOPIC_SEED_ALL } = require('./geo-topic-seed-list')
const { GEO_PROMPT_SEED } = require('./geo-prompt-seed')
const { generateGeoPageDrafts } = require('../services/geo-page-generator.service')

const MOCK_CASES = [
  {
    id: 'c1',
    city: '杭州',
    serviceName: '刹车片更换',
    inspectResult: '刹车片磨损接近极限',
    planAmount: 420,
    seoNoindex: false,
  },
  {
    id: 'c2',
    city: '杭州',
    serviceName: '小保养',
    inspectResult: '机油老化',
    planAmount: 380,
    seoNoindex: false,
  },
]

function run() {
  assert.strictEqual(GEO_TOPIC_SEED_LIST.length, 30)
  assert.ok(GEO_TOPIC_SEED_ALL.length >= 50, '扩容种子应 ≥50')
  assert.strictEqual(GEO_PROMPT_SEED.length, GEO_TOPIC_SEED_ALL.length)

  const slugs = new Set()
  const promptIds = new Set()
  GEO_TOPIC_SEED_ALL.forEach((seed) => {
    assert.ok(seed.slug, 'slug required')
    assert.ok(seed.promptId, 'promptId required')
    assert.ok(seed.promptText, 'promptText required')
    assert.ok(seed.serviceItemId, 'serviceItemId required')
    assert.ok(!slugs.has(seed.slug), `duplicate slug ${seed.slug}`)
    assert.ok(!promptIds.has(seed.promptId), `duplicate promptId ${seed.promptId}`)
    slugs.add(seed.slug)
    promptIds.add(seed.promptId)
  })

  const drafts = generateGeoPageDrafts(GEO_TOPIC_SEED_ALL)
  assert.strictEqual(drafts.length, GEO_TOPIC_SEED_ALL.length)
  drafts.forEach((draft) => {
    assert.ok(draft.id.startsWith('geop_'))
    assert.ok(draft.faq.length >= 1, `faq missing for ${draft.slug}`)
    assert.ok(!draft.aiSummary.includes('常见咨询汇总'), `forbidden template in ${draft.slug}`)
    assert.ok(draft.seoTitle.length > 0)
  })

  const draftsWithCases = generateGeoPageDrafts(GEO_TOPIC_SEED_LIST, { allCases: MOCK_CASES })
  const hzBrake = draftsWithCases.find((item) => item.slug === 'hangzhou-brake-pad')
  assert.ok(hzBrake)
  assert.ok(hzBrake.aiSummary.includes('例脱敏案例'))

  const byType = drafts.reduce((acc, item) => {
    acc[item.pageType] = (acc[item.pageType] || 0) + 1
    return acc
  }, {})
  assert.ok(byType.city_service >= 5)
  assert.ok(byType.fault_qa >= 16)

  console.log('[geo-topic-seed.test] ok', { total: drafts.length, byType })
}

run()
