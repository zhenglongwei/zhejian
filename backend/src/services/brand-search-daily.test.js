const assert = require('assert')
const { aggregateRowMetrics, buildRowId } = require('./brand-search-daily.service')

function run() {
  const metrics = aggregateRowMetrics([
    { channel: 'direct', source: '', referrer: '', eventParams: {} },
    {
      channel: 'search',
      source: 'zhejian',
      referrer: '',
      eventParams: { keyword: '辙见 刹车' },
    },
    { channel: 'referral', source: '', referrer: 'https://geo.simplewin.cn/', eventParams: {} },
    { channel: 'organic', source: 'google', referrer: '', eventParams: {} },
  ])

  assert.strictEqual(metrics.brandAttributedViews, 3)
  assert.strictEqual(metrics.directViews, 1)
  assert.strictEqual(metrics.brandSourceViews, 1)
  assert.strictEqual(metrics.brandSearchSubmitViews, 1)
  assert.strictEqual(buildRowId(new Date('2026-07-01T00:00:00.000Z')), 'bsd_2026-07-01')

  console.log('[brand-search-daily.test] ok')
}

run()
