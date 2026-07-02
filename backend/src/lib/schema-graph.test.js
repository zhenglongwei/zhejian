const assert = require('assert')
const {
  buildServicePageSchemaGraph,
  buildCasePageSchemaGraph,
  buildHomePageSchemaGraph,
  entityId,
} = require('./schema-graph')

function run() {
  const base = 'https://geo.example.com'
  const serviceGraph = buildServicePageSchemaGraph({
    baseUrl: base,
    item: { slug: 'brake-pad-replacement', name: '刹车片更换', aiSummary: '测试摘要' },
    seo: {
      title: '刹车片更换',
      description: '测试摘要',
      canonicalPath: '/service/brake-pad-replacement.html',
    },
    aggregateStats: {
      sampleSize: 5,
      price: { text: '方案价参考区间 ¥300–¥500（仅供参考）' },
      causeDistribution: [{ label: '片厚不足', count: 3 }],
    },
    faq: [{ q: '常见问题', a: '答案' }],
  })

  assert.strictEqual(serviceGraph['@context'], 'https://schema.org')
  assert.ok(Array.isArray(serviceGraph['@graph']))
  assert.ok(serviceGraph['@graph'].some((node) => node['@type'] === 'Dataset'))
  assert.ok(serviceGraph['@graph'].some((node) => node['@type'] === 'Service' && node['@id']))
  assert.strictEqual(
    entityId(base, '/service/brake-pad-replacement.html', 'service'),
    `${base}/service/brake-pad-replacement.html#service`
  )

  const caseGraph = buildCasePageSchemaGraph({
    baseUrl: base,
    showStorePublicly: true,
    serviceSlug: 'brake-pad-replacement',
    data: {
      id: 'case_001',
      slug: 'case-001',
      title: '测试案例',
      serviceName: '刹车片更换',
      city: '杭州',
      store: { id: 'store_1', name: '测试门店' },
      faq: [{ q: 'Q', a: 'A' }],
    },
  })
  assert.ok(caseGraph['@graph'].some((node) => node['@type'] === 'Article'))

  const homeGraph = buildHomePageSchemaGraph({
    baseUrl: base,
    organizationSameAs: ['https://simplewin.cn'],
  })
  const homeOrg = homeGraph['@graph'].find((node) => node['@type'] === 'Organization')
  assert.ok(Array.isArray(homeOrg.sameAs))
  assert.strictEqual(homeOrg.sameAs[0], 'https://simplewin.cn')

  console.log('[schema-graph.test] ok')
}

run()
