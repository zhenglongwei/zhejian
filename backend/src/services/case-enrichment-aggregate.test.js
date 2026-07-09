const test = require('node:test')
const assert = require('node:assert/strict')

const {
  mapPublicCaseRowToAggregateInput,
  buildDerivedFaqForCaseRow,
} = require('./case-enrichment-aggregate.service')
const {
  buildDerivedAggregateFaq,
  aggregatePublicCases,
  mergeDerivedFaq,
} = require('./geo-case-aggregate.service')

test('mapPublicCaseRowToAggregateInput reads enrichment inspectResult and snapshot price', () => {
  const row = {
    id: 'case_1',
    minAmount: 300,
    maxAmount: 500,
    priceMode: 'range',
    seoNoindex: false,
    contentJson: {
      snapshot: {
        version: 1,
        planAmount: 420,
        price: { planAmount: 420, minAmount: 420, maxAmount: 420, priceMode: 'fixed' },
        geo: { inspectResult: '快照检测' },
      },
    },
    enrichmentJson: {
      version: 1,
      geo: { inspectResult: '提炼层检测结论' },
    },
  }
  const input = mapPublicCaseRowToAggregateInput(row)
  assert.equal(input.inspectResult, '提炼层检测结论')
  assert.equal(input.planAmount, 420)
})

test('buildDerivedFaqForCaseRow produces case-derived FAQ with sample size', () => {
  const row = {
    id: 'case_1',
    city: '杭州',
    serviceName: '刹车片更换',
    priceMode: 'range',
    contentJson: { snapshot: { version: 1, nodes: [] } },
    enrichmentJson: { version: 1, faq: [{ q: '运营 FAQ', a: '答' }] },
  }
  const peers = [
    row,
    {
      id: 'case_2',
      seoNoindex: false,
      contentJson: {},
      enrichmentJson: {
        version: 1,
        geo: { inspectResult: '刹车片磨损接近极限' },
      },
      minAmount: 380,
      maxAmount: 460,
    },
    {
      id: 'case_3',
      seoNoindex: false,
      contentJson: {},
      enrichmentJson: {
        version: 1,
        geo: { inspectResult: '片厚不足建议更换' },
      },
      minAmount: 400,
      maxAmount: 520,
    },
  ]

  const { derivedFaq, aggregateStats } = buildDerivedFaqForCaseRow(row, peers)
  assert.ok(aggregateStats.sampleSize >= 3)
  assert.ok(derivedFaq.length >= 1)
  assert.ok(derivedFaq[0].a.includes('例'))

  const merged = mergeDerivedFaq(row.enrichmentJson.faq, derivedFaq)
  assert.equal(merged[0].q, derivedFaq[0].q)
  assert.equal(merged[merged.length - 1].q, '运营 FAQ')
})

test('buildDerivedAggregateFaq stays empty without samples', () => {
  const faq = buildDerivedAggregateFaq({
    serviceName: '刹车片更换',
    city: '杭州',
    aggregateStats: aggregatePublicCases([], { priceMode: 'range' }),
  })
  assert.equal(faq.length, 0)
})
