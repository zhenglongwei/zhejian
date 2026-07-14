/**
 * 门店透明度 dimensions 契约单测
 */
const assert = require('assert')
const {
  buildTransparencyDimensions,
  normalizeTransparencyPayload,
} = require('./store-transparency.schema')
const { buildStorePageSchemaGraph } = require('../lib/schema-graph')

function run() {
  const dimensions = buildTransparencyDimensions({
    storeId: 'store_demo_1',
    caseCount: 2,
    albumCompleteRate: 86,
    serviceCount: 3,
    breakdown: { case: 17, album: 26, serviceProfile: 10, qualification: 15, leadResponse: 8 },
    certifications: [{ label: '营业执照', text: '已认证', status: 'verified' }],
    certWall: [{ label: '营业执照', imageUrl: '/media/x.jpg', text: '已认证' }],
    casePreviews: [{ id: 'c1', title: '杭州保养案例', slug: 'hangzhou-maintenance' }],
  })

  assert.strictEqual(dimensions.length, 5)
  const cases = dimensions.find((item) => item.id === 'public_cases')
  assert.strictEqual(cases.value, 2)
  assert.strictEqual(cases.evidence.url, '/store/store_demo_1/cases')
  assert.strictEqual(cases.evidence.anchor, '#store-cases')
  assert.strictEqual(cases.evidence.preview[0].title, '杭州保养案例')

  const qual = dimensions.find((item) => item.id === 'qualification')
  assert.strictEqual(qual.displayValue, '已核验')
  assert.strictEqual(qual.evidence.anchor, '#store-trust')
  assert.ok(qual.evidence.items.length > 0)

  const payload = normalizeTransparencyPayload({
    score: 76,
    asOfDate: '2026-07-13',
    summary: '测试',
    dimensions,
  })
  assert.strictEqual(payload.dimensions.length, 5)

  const graph = buildStorePageSchemaGraph({
    baseUrl: 'https://geo.example.com',
    store: {
      id: 'store_demo_1',
      name: '示范店',
      aiSummary: '简介',
      certifications: [{ label: '营业执照', text: '已认证' }],
      certWall: [{ label: '营业执照', imageUrl: '/media/x.jpg' }],
      faq: [{ q: '如何预约？', a: '电话预约' }],
    },
    transparency: payload,
  })
  assert.ok(graph['@graph'].some((node) => node['@type'] === 'AutoRepair'))
  const auto = graph['@graph'].find((node) => node['@type'] === 'AutoRepair')
  assert.ok(
    auto.additionalProperty.some(
      (item) => item.name === 'transparency.public_cases.evidenceUrl'
    )
  )
  assert.ok(graph['@graph'].some((node) => node['@type'] === 'ItemList'))
  assert.ok(graph['@graph'].some((node) => node['@type'] === 'FAQPage'))

  console.log('[store-transparency.schema.test] ok')
}

run()
