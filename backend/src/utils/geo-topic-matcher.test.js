/**
 * GEO-TOPIC-C01 · geo-topic-matcher 单测
 * 运行：node src/utils/geo-topic-matcher.test.js
 */
const assert = require('assert')
const {
  matchCaseToGeoPages,
  matchGeoPagesForCaseMount,
  buildServicePagePath,
  orderCasesByIds,
} = require('./geo-topic-matcher')

const brakeService = {
  slug: 'brake-pad-replacement',
  serviceItemId: 'item_brake_pad',
  name: '刹车片更换',
}

const geoPages = [
  {
    id: 'geop_svc_brake',
    slug: 'brake-pad-replacement',
    title: '刹车片更换价格参考与维修案例',
    summary: '刹车片更换说明',
    pageType: 'service_base',
    city: '',
    serviceId: 'item_brake_pad',
    relatedServiceId: 'item_brake_pad',
    keywords: ['刹车片更换'],
    faultTag: '',
    serviceMeta: { serviceItemId: 'item_brake_pad' },
  },
  {
    id: 'geop_hz_brake',
    slug: 'hangzhou-brake-pad',
    title: '杭州刹车片更换',
    summary: '杭州本地刹车片更换',
    pageType: 'city_service',
    city: '杭州',
    serviceId: 'item_brake_pad',
    relatedServiceId: 'item_brake_pad',
    keywords: ['杭州', '刹车片'],
    faultTag: '',
    serviceMeta: { serviceItemId: 'item_brake_pad' },
  },
  {
    id: 'geop_sh_ac',
    slug: 'shanghai-ac-service',
    title: '上海空调清洗',
    summary: '上海空调服务',
    pageType: 'city_service',
    city: '上海',
    serviceId: 'item_ac_clean',
    relatedServiceId: 'item_ac_clean',
    keywords: ['空调'],
    faultTag: '',
    serviceMeta: { serviceItemId: 'item_ac_clean' },
  },
]

function run() {
  const hangzhouBrakeCase = {
    id: 'case_001',
    city: '杭州',
    serviceName: '刹车片更换',
    serviceItemId: 'item_brake_pad',
    title: '杭州宝马刹车异响案例',
    summary: '刹车异响到店检查',
    faultDesc: '刹车异响',
    tags: ['authorized'],
  }

  const match = matchCaseToGeoPages(hangzhouBrakeCase, geoPages)
  assert.ok(match.serviceItem)
  assert.strictEqual(match.serviceItem.slug, 'brake-pad-replacement')
  assert.strictEqual(match.servicePath, '/service/brake-pad-replacement.html?city=%E6%9D%AD%E5%B7%9E')
  assert.strictEqual(match.bestGeoPage.slug, 'hangzhou-brake-pad')

  const mountIds = matchGeoPagesForCaseMount(hangzhouBrakeCase, geoPages)
  assert.ok(mountIds.includes('geop_svc_brake'))
  assert.ok(mountIds.includes('geop_hz_brake'))
  assert.ok(!mountIds.includes('geop_sh_ac'))

  const shanghaiMismatch = matchCaseToGeoPages(
    { ...hangzhouBrakeCase, city: '上海' },
    geoPages
  )
  assert.ok(
    !shanghaiMismatch.geoPages.some((page) => page.slug === 'hangzhou-brake-pad')
  )

  assert.strictEqual(
    buildServicePagePath('brake-pad-replacement', ''),
    '/service/brake-pad-replacement.html'
  )

  const ordered = orderCasesByIds(
    [
      { id: 'c1', title: '1' },
      { id: 'c2', title: '2' },
      { id: 'c3', title: '3' },
    ],
    ['c3', 'c1'],
    3
  )
  assert.deepStrictEqual(
    ordered.map((item) => item.id),
    ['c3', 'c1', 'c2']
  )

  console.log('[geo-topic-matcher.test] ok')
}

run()
