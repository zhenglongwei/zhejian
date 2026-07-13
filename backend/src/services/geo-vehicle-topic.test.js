const assert = require('assert')
const {
  parseVehicleSeriesFromCase,
  filterCasesByVehicleSeries,
  discoverVehicleSeriesTopicSeeds,
  applyAggregateToVehicleTopicContent,
  validateVehicleTopicPublishGate,
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
    {
      id: 'c4',
      vehicleText: '宝马3系 325i',
      serviceName: '刹车片更换',
      serviceItemId: 'item_brake_pad',
      inspectResult: '片厚不足',
      planAmount: 440,
      seoNoindex: false,
    },
  ]

  assert.strictEqual(parseVehicleSeriesFromCase(cases[0]), '宝马3系')
  assert.strictEqual(filterCasesByVehicleSeries(cases, '宝马3系').length, 3)

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
  assert.strictEqual(agg.matchedCaseCount, 3)
  assert.ok(agg.aiSummary.includes('3 例脱敏案例'))
  assert.ok(agg.faq.length >= 1)

  let blocked = false
  try {
    validateVehicleTopicPublishGate(
      {
        slug: seeds[0].slug,
        vehicleSeries: '宝马3系',
        serviceId: 'item_brake_pad',
        relatedServiceId: 'item_brake_pad',
        relatedCaseIds: ['c1', 'c2'],
        aiSummary: agg.aiSummary,
        faq: agg.faq,
      },
      cases
    )
  } catch (error) {
    blocked = true
  }
  assert.strictEqual(blocked, true, '2 例应低于发布门槛')

  const gateOk = validateVehicleTopicPublishGate(
    {
      slug: seeds[0].slug,
      vehicleSeries: '宝马3系',
      serviceId: 'item_brake_pad',
      relatedServiceId: 'item_brake_pad',
      relatedCaseIds: [],
      aiSummary: agg.aiSummary,
      faq: agg.faq,
    },
    cases
  )
  assert.strictEqual(gateOk.caseCount, 3)
  assert.strictEqual(gateOk.passed, true)

  console.log('[geo-vehicle-topic.test] ok')
}

run()
