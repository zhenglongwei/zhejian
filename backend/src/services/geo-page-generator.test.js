/**
 * GEO-IGAIN-A04 / GEO-TOPIC-G01-G02 · 生成器聚合摘要与 FAQ 单测
 * 运行：node src/services/geo-page-generator.test.js
 */
const assert = require('assert')
const { GEO_TOPIC_SEED_LIST } = require('../constants/geo-topic-seed-list')
const {
  generateGeoPageDraft,
  generateGeoPageDrafts,
  buildAggregateContent,
} = require('./geo-page-generator.service')

const MOCK_HANGZHOU_BRAKE_CASES = [
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
    serviceName: '刹车片更换',
    inspectResult: '刹车盘存在轻微拉痕',
    planAmount: 500,
    seoNoindex: false,
  },
  {
    id: 'c3',
    city: '杭州',
    serviceName: '刹车片更换',
    inspectResult: '片厚不足建议更换',
    minAmount: 380,
    maxAmount: 460,
    seoNoindex: false,
  },
]

function run() {
  const seed = GEO_TOPIC_SEED_LIST.find((item) => item.slug === 'hangzhou-brake-pad')
  assert.ok(seed, 'hangzhou-brake-pad seed required')

  const draftNoCases = generateGeoPageDraft(seed)
  assert.strictEqual(draftNoCases.aiSummary, '')
  assert.ok(!draftNoCases.aiSummary.includes('常见咨询汇总'))
  assert.ok(draftNoCases.faq.length >= 1)

  const draftWithCases = generateGeoPageDraft(seed, { allCases: MOCK_HANGZHOU_BRAKE_CASES })
  assert.ok(draftWithCases.aiSummary.includes('3 例脱敏案例'))
  assert.ok(draftWithCases.aiSummary.includes('到店检测'))
  assert.ok(
    draftWithCases.faq.some((item) => String(item.a || '').includes('3 例')),
    'FAQ 应含案例衍生条目'
  )

  const { aiSummary, faq } = buildAggregateContent(seed, { name: '刹车片更换', priceMode: 'range' }, MOCK_HANGZHOU_BRAKE_CASES)
  assert.ok(aiSummary.includes('杭州刹车片更换'))
  assert.ok(faq.some((item) => String(item.q || '').includes('常见原因')))

  const drafts = generateGeoPageDrafts(GEO_TOPIC_SEED_LIST.slice(0, 3), {
    allCases: MOCK_HANGZHOU_BRAKE_CASES,
  })
  assert.strictEqual(drafts.length, 3)

  console.log('[geo-page-generator.test] ok')
}

run()
