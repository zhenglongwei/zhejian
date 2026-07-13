/**
 * GEO-TOPIC-D05 · 专题服务路径解析单测
 */
const assert = require('assert')
const {
  resolveLegacyTopicRedirect,
  resolveServiceSlugFromGeoPage,
  buildGeoPageServicePath,
  isPublicDiscoverableGeoPage,
} = require('./geo-page-service-resolve')

function run() {
  assert.strictEqual(
    resolveLegacyTopicRedirect('bmw-3-series-maintenance')?.location,
    '/service/car-maintenance.html?city=%E6%9D%AD%E5%B7%9E'
  )
  assert.strictEqual(
    resolveLegacyTopicRedirect('store-demo-hangzhou')?.location,
    '/store/store_demo_1.html'
  )

  const bodyPaint = {
    slug: 'hangzhou-body-paint',
    pageType: 'city_service',
    title: '杭州钣金喷漆门店参考',
    city: '杭州',
    keywords: ['钣金', '喷漆'],
    serviceMeta: {},
  }
  assert.strictEqual(resolveServiceSlugFromGeoPage(bodyPaint), 'body-paint-repair')
  assert.ok(buildGeoPageServicePath(bodyPaint).startsWith('/service/body-paint-repair.html'))

  const bmw = {
    slug: 'bmw-3-series-maintenance',
    pageType: 'vehicle_service',
    title: '宝马 3 系保养参考',
    city: '杭州',
    keywords: ['保养'],
  }
  assert.strictEqual(resolveServiceSlugFromGeoPage(bmw), 'car-maintenance')

  const merchant = {
    slug: 'store-demo-hangzhou',
    pageType: 'merchant_geo',
    status: 'published',
    title: '示范店',
  }
  assert.strictEqual(isPublicDiscoverableGeoPage(merchant), false)

  console.log('[geo-page-service-resolve.test] ok')
}

run()
