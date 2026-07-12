const assert = require('assert')
const { parseAggregateStats, normalizeAdvanced } = require('./geo-aggregate.schema')

function run() {
  const valid = parseAggregateStats({
    sampleSize: 5,
    windowLabel: '近12个月',
    computedAt: new Date().toISOString(),
    causeDistribution: [{ label: '片厚不足', count: 3 }],
    advanced: {
      causePriceCross: [{ cause: '片厚不足', count: 3, priceMedian: 420 }],
      processMetrics: { sampleCount: 5, hasPublicImageRate: 0.6 },
      mileageBands: [{ band: 'mid', bandLabel: '5–10万km', count: 3, topCause: '片厚不足' }],
      inspectToPlan: [{ inspect: '片厚不足', topPlan: '更换相关', count: 3 }],
    },
  })
  assert.strictEqual(valid.ok, true)
  assert.ok(valid.data.advanced?.mileageBands?.length === 1)
  assert.ok(valid.data.advanced?.inspectToPlan?.length === 1)

  const invalidCross = parseAggregateStats({
    sampleSize: 5,
    advanced: { causePriceCross: [{ cause: '测试', count: 2, priceMedian: 100 }] },
  })
  assert.strictEqual(invalidCross.ok, true)
  assert.strictEqual(invalidCross.data.advanced, undefined)

  assert.strictEqual(normalizeAdvanced({ causePriceCross: [] }, 4), null)

  console.log('[geo-aggregate.schema.test] ok')
}

run()
