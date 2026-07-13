const assert = require('assert')
const {
  hasInformationGainSummary,
  resolvePageHealthFlags,
  computeGeoTopicHealthMetrics,
} = require('./geo-topic-health.service')

async function run() {
  assert.strictEqual(
    hasInformationGainSummary('辙见平台近12个月收录 3 例脱敏案例'),
    true
  )
  assert.strictEqual(hasInformationGainSummary('仅合规通用说明'), false)

  const flags = resolvePageHealthFlags({
    status: 'published',
    faqJson: [{ q: 'Q1', a: 'A1' }, { q: 'Q2', a: 'A2' }, { q: 'Q3', a: 'A3' }],
    relatedCaseIdsJson: ['case_1'],
    aiSummary: '近12个月收录 2 例脱敏案例',
  })
  assert.strictEqual(flags.faqComplete, true)
  assert.strictEqual(flags.hasInformationGain, true)

  const metrics = await computeGeoTopicHealthMetrics()
  assert.ok('topic_with_stats_rate' in metrics)
  assert.ok('topic_with_case_mounted_count' in metrics)
  assert.ok(metrics.topic_with_stats_rate >= 0 && metrics.topic_with_stats_rate <= 1)

  console.log('[geo-topic-health.test] ok', {
    topic_with_stats_rate: metrics.topic_with_stats_rate,
    information_gain_rate: metrics.information_gain_rate,
  })
}

run().catch((error) => {
  console.error('[geo-topic-health.test] ❌', error.message)
  process.exit(1)
})
