const assert = require('assert')
const {
  parseVehicleSeriesFromCase,
  filterCasesByVehicleSeries,
  discoverVehicleSeriesTopicSeeds,
  applyAggregateToVehicleTopicContent,
} = require('./geo-vehicle-topic.service')

function run() {
  const cases = [
    {
      id: 'c1',
      vehicleText: '宝马 3系',
      serviceName: '刹车片更换',
      serviceItemId: 'item_brake_pad',
      inspectResult: '片厚不足',
      planAmount: 420,
      seoNoindex: false,
    },
    {
      id: 'c2',
      vehicleText: '宝马3系',
      serviceName: '刹车片更换',
      serviceItemId: 'item_brake_pad',
      inspectResult: '盘面积碳',
      planAmount: 500,
      seoNoindex: false,
    },
    {
      id: 'c3',
      vehicleText: '奥迪 A4',
      serviceName: '刹车片更换',
      serviceItemId: 'item_brake_pad',
      inspectResult: '片厚不足',
      planAmount: 460,
      seoNoindex: false,
    },
  ]

  assert.strictEqual(parseVehicleSeriesFromCase(cases[0]), '宝马3系')
  assert.strictEqual(filterCasesByVehicleSeries(cases, '宝马3系').length, 2)

  const seeds = discoverVehicleSeriesTopicSeeds(cases, { minSample: 2 })
  assert.ok(seeds.length >= 1)
  assert.strictEqual(seeds[0].pageType, 'vehicle_service')

  const agg = applyAggregateToVehicleTopicContent({
    cases,
    serviceName: '刹车片更换',
    vehicleSeries: '宝马3系',
    priceMode: 'range',
    faq: [],
  })
  assert.strictEqual(agg.matchedCaseCount, 2)
  assert.ok(agg.aiSummary.includes('2 例脱敏案例'))
  assert.ok(agg.faq.length >= 1)

  console.log('[geo-vehicle-topic.test] ok')
}

run()
