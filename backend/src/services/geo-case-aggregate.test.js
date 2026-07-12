const assert = require('assert')
const {
  aggregatePublicCases,
  buildAggregateAiSummary,
  buildDerivedAggregateFaq,
  filterIndexableCases,
  normalizeCauseLabel,
  normalizePlanLabel,
  parseMileageKm,
  resolveMileageBand,
} = require('./geo-case-aggregate.service')

function run() {
  assert.strictEqual(parseMileageKm('8.5万'), 85000)
  assert.strictEqual(parseMileageKm('62000 km'), 62000)
  assert.strictEqual(resolveMileageBand(62000), 'mid')
  assert.strictEqual(
    normalizePlanLabel('建议更换前刹车片与刹车盘'),
    '更换相关'
  )
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

  const advancedCases = [
    {
      inspectResult: '刹车片磨损接近极限',
      repairPlan: '更换前刹车片',
      planAmount: 420,
      mileageKm: 62000,
      trustMeta: { publicImageCount: 1 },
    },
    {
      inspectResult: '片厚不足建议更换',
      repairPlan: '更换刹车片',
      planAmount: 450,
      mileageKm: 58000,
      trustMeta: { publicImageCount: 0 },
    },
    {
      inspectResult: '刹车盘存在轻微拉痕',
      repairPlan: '更换刹车盘',
      planAmount: 520,
      mileageKm: 88000,
      trustMeta: { publicImageCount: 1 },
    },
    {
      inspectResult: '前轮片厚不足',
      repairPlan: '更换前制动片',
      minAmount: 400,
      maxAmount: 480,
      mileageKm: 72000,
      trustMeta: { publicImageCount: 3 },
    },
    {
      inspectResult: '磨损接近极限需更换',
      repairPlan: '更换制动片',
      planAmount: 410,
      mileageKm: 65000,
      trustMeta: { publicImageCount: 0 },
    },
  ]
  const advancedStats = aggregatePublicCases(advancedCases, { priceMode: 'range' })
  assert.strictEqual(advancedStats.sampleSize, 5)
  assert.ok(advancedStats.advanced?.causePriceCross?.length >= 1)
  assert.ok(advancedStats.advanced?.mileageBands?.length >= 1)
  assert.ok(advancedStats.advanced?.inspectToPlan?.length >= 1)

  const advancedSummary = buildAggregateAiSummary({
    serviceName: '刹车片更换',
    city: '杭州',
    aggregateStats: advancedStats,
  })
  assert.ok(advancedSummary.includes('里程段'))
  assert.ok(advancedSummary.includes('常见方案'))

  const advancedFaq = buildDerivedAggregateFaq({
    serviceName: '刹车片更换',
    city: '杭州',
    aggregateStats: advancedStats,
  })
  assert.ok(advancedFaq.some((item) => item.q.includes('里程段')))

  console.log('[geo-case-aggregate.test] ok')
}

run()
