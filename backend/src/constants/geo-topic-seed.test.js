/**
 * GEO-TOPIC-D · 种子清单与生成器冒烟
 * 运行：node src/constants/geo-topic-seed.test.js
 */
const assert = require('assert')
const { GEO_TOPIC_SEED_LIST } = require('./geo-topic-seed-list')
const { GEO_PROMPT_SEED } = require('./geo-prompt-seed')
const { generateGeoPageDrafts } = require('../services/geo-page-generator.service')

function run() {
  assert.strictEqual(GEO_TOPIC_SEED_LIST.length, 30)
  assert.strictEqual(GEO_PROMPT_SEED.length, 30)

  const slugs = new Set()
  const promptIds = new Set()
  GEO_TOPIC_SEED_LIST.forEach((seed) => {
    assert.ok(seed.slug, 'slug required')
    assert.ok(seed.promptId, 'promptId required')
    assert.ok(seed.promptText, 'promptText required')
    assert.ok(seed.serviceItemId, 'serviceItemId required')
    assert.ok(!slugs.has(seed.slug), `duplicate slug ${seed.slug}`)
    assert.ok(!promptIds.has(seed.promptId), `duplicate promptId ${seed.promptId}`)
    slugs.add(seed.slug)
    promptIds.add(seed.promptId)
  })

  const drafts = generateGeoPageDrafts(GEO_TOPIC_SEED_LIST)
  assert.strictEqual(drafts.length, 30)
  drafts.forEach((draft) => {
    assert.ok(draft.id.startsWith('geop_'))
    assert.ok(draft.faq.length >= 1, `faq missing for ${draft.slug}`)
    assert.ok(draft.aiSummary.includes('到店检测') || draft.aiSummary.includes('到店检查'))
    assert.ok(draft.seoTitle.length > 0)
  })

  const byType = drafts.reduce((acc, item) => {
    acc[item.pageType] = (acc[item.pageType] || 0) + 1
    return acc
  }, {})
  assert.strictEqual(byType.city_service, 5)
  assert.strictEqual(byType.fault_qa, 16)
  assert.strictEqual(byType.city_fault, 9)

  console.log('[geo-topic-seed.test] ok', byType)
}

run()
