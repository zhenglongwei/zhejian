/**
 * 门店透明度 dimensions 契约单测（含 P2 公开/内部分项）
 */
const assert = require('assert')
const {
  buildTransparencyDimensions,
  normalizeTransparencyPayload,
  isTransparencyExposed,
  PUBLIC_METHODOLOGY,
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

  // 公开默认不含咨询响应；含新鲜度/能力（有证据才进列表）
  assert.ok(dimensions.length >= 4)
  assert.ok(!dimensions.some((item) => item.id === 'lead_response'))
  assert.ok(dimensions.some((item) => item.id === 'public_cases'))
  assert.ok(dimensions.some((item) => item.id === 'album_completeness'))
  assert.ok(dimensions.some((item) => item.id === 'qualification'))
  const album = dimensions.find((item) => item.id === 'album_completeness')
  assert.strictEqual(album.label, '过程资料齐全度')
  assert.ok(String(album.displayValue).includes('86'))
  assert.strictEqual(album.scorePart, null)

  const cases = dimensions.find((item) => item.id === 'public_cases')
  assert.strictEqual(cases.value, 2)
  assert.strictEqual(cases.evidence.url, '/store/store_demo_1/cases')
  assert.strictEqual(cases.evidence.anchor, '#store-cases')
  assert.strictEqual(cases.evidence.preview[0].title, '杭州保养案例')

  const qual = dimensions.find((item) => item.id === 'qualification')
  assert.strictEqual(qual.displayValue, '已核验')
  assert.strictEqual(qual.evidence.anchor, '#store-trust')
  assert.ok(qual.evidence.items.length > 0)

  const internalDims = buildTransparencyDimensions(
    {
      storeId: 'store_demo_1',
      caseCount: 2,
      albumCompleteRate: 86,
      serviceCount: 3,
      breakdown: { case: 17, album: 26, serviceProfile: 10, qualification: 15, leadResponse: 8 },
      certifications: [{ label: '营业执照', text: '已认证' }],
    },
    { audience: 'all' }
  )
  assert.ok(internalDims.some((item) => item.id === 'lead_response'))

  const emptyDims = buildTransparencyDimensions({
    storeId: 'store_empty',
    caseCount: 0,
    serviceCount: 0,
    certifications: [{ label: '营业执照', text: '已认证' }],
  })
  assert.strictEqual(emptyDims.length, 0)

  const emptyPayload = normalizeTransparencyPayload({
    caseCount: 0,
    score: 0,
    dimensions: [],
  })
  assert.strictEqual(emptyPayload.exposed, false)
  assert.strictEqual(emptyPayload.score, null)
  assert.strictEqual(emptyPayload.dimensions.length, 0)
  assert.ok(String(emptyPayload.summary).includes('完善中'))
  assert.strictEqual(isTransparencyExposed(emptyPayload), false)

  const payload = normalizeTransparencyPayload({
    score: 76,
    caseCount: 2,
    asOfDate: '2026-07-13',
    summary: '测试',
    dimensions,
  })
  assert.strictEqual(payload.exposed, true)
  assert.strictEqual(payload.dimensions.length, 4)
  assert.strictEqual(payload.breakdown, null)
  assert.ok(!payload.dimensions.some((item) => item.id === 'lead_response'))
  assert.ok(payload.dimensions.every((item) => item.scorePart == null))
  assert.ok(String(payload.methodology).includes('咨询响应'))
  assert.ok(payload.methodology === PUBLIC_METHODOLOGY || payload.methodology.length > 0)

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
  assert.ok(
    !auto.additionalProperty.some((item) => String(item.name).includes('lead_response'))
  )
  assert.ok(
    !auto.additionalProperty.some((item) => String(item.name).endsWith('.scorePart'))
  )
  assert.ok(graph['@graph'].some((node) => node['@type'] === 'ItemList'))
  assert.ok(graph['@graph'].some((node) => node['@type'] === 'FAQPage'))

  const emptyGraph = buildStorePageSchemaGraph({
    baseUrl: 'https://geo.example.com',
    store: {
      id: 'store_empty',
      name: '空店',
      aiSummary: '门店简介',
      caseCount: 0,
      certWall: [{ label: '营业执照', imageUrl: '/media/license.jpg' }],
    },
    transparency: emptyPayload,
  })
  const emptyAuto = emptyGraph['@graph'].find((node) => node['@type'] === 'AutoRepair')
  const props = emptyAuto.additionalProperty || []
  assert.ok(!props.some((item) => String(item.name).startsWith('transparency')))
  assert.ok(emptyGraph['@graph'].some((node) => node['@type'] === 'ImageObject'))

  const filteredDims = buildTransparencyDimensions({
    storeId: 'store_demo_2',
    caseCount: 1,
    albumCompleteRate: null,
    serviceCount: 0,
    breakdown: { case: 10, album: 0, serviceProfile: 0, qualification: 15, leadResponse: 8 },
    certifications: [{ label: '营业执照', text: '已认证' }],
    casePreviews: [{ id: 'c2', title: '案例B' }],
  })
  assert.ok(filteredDims.every((dim) => dim.evidence.available))
  assert.ok(!filteredDims.some((dim) => dim.id === 'album_completeness'))
  assert.ok(!filteredDims.some((dim) => dim.id === 'lead_response'))
  assert.ok(!filteredDims.some((dim) => dim.id === 'service_profile'))

  console.log('[store-transparency.schema.test] ok')
}

run()
