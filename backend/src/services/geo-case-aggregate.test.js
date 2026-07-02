const assert = require('assert')
const {
  aggregatePublicCases,
  buildAggregateAiSummary,
  buildDerivedAggregateFaq,
  filterIndexableCases,
  normalizeCauseLabel,
} = require('./geo-case-aggregate.service')

function run() {
  assert.strictEqual(
    normalizeCauseLabel('检查发现前轮刹车片磨损接近极限'),
    '片厚不足或磨损接近极限'
  )
  assert.strictEqual(filterIndexableCases([{ id: '1' }, { id: '2', seoNoindex: true }]).length, 1)

  const cases = [
    {
      inspectResult: '刹车片磨损接近极限',
      planAmount: 420,
      minAmount: 380,
      maxAmount: 460,
    },
    {
      inspectResult: '刹车盘存在轻微拉痕',
      planAmount: 520,
    },
    {
      inspectResult: '片厚不足建议更换',
      minAmount: 400,
      maxAmount: 500,
    },
  ]

  const stats = aggregatePublicCases(cases, { priceMode: 'range' })
  assert.strictEqual(stats.sampleSize, 3)
  assert.ok(stats.price)
  assert.ok(stats.causeDistribution.length >= 1)

  const summary = buildAggregateAiSummary({
    serviceName: '刹车片更换',
    city: '杭州',
    aggregateStats: stats,
  })
  assert.ok(summary.includes('N=') === false)
  assert.ok(summary.includes('3 例脱敏案例'))
  assert.ok(summary.includes('到店检测'))

  const faq = buildDerivedAggregateFaq({
    serviceName: '刹车片更换',
    city: '杭州',
    aggregateStats: stats,
  })
  assert.ok(faq.length >= 1)
  assert.ok(faq[0].a.includes('3 例'))

  console.log('[geo-case-aggregate.test] ok')
}

run()
