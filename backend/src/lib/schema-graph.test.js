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
      advanced: {
        causePriceCross: [{ cause: '片厚不足', count: 3, priceMedian: 420 }],
        processMetrics: { sampleCount: 5, hasPublicImageRate: 0.4 },
        mileageBands: [{ band: 'mid', bandLabel: '5–10万km', count: 3, topCause: '片厚不足' }],
        inspectToPlan: [{ inspect: '片厚不足', topPlan: '更换相关', count: 3 }],
      },
    },
    faq: [{ q: '常见问题', a: '答案' }],
  })

  assert.strictEqual(serviceGraph['@context'], 'https://schema.org')
  assert.ok(Array.isArray(serviceGraph['@graph']))
  assert.ok(serviceGraph['@graph'].some((node) => node['@type'] === 'Dataset'))
  const dataset = serviceGraph['@graph'].find((node) => node['@type'] === 'Dataset')
  assert.ok(dataset.variableMeasured.some((item) => item.name === 'causePriceCross'))
  assert.ok(dataset.variableMeasured.some((item) => item.name === 'mileageBandDistribution'))
  assert.ok(dataset.variableMeasured.some((item) => item.name === 'inspectToPlan'))
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
      status: 'public_approved',
      albumId: 'alb_001',
      store: { id: 'store_1', name: '测试门店' },
      faq: [{ q: 'Q', a: 'A' }],
      trustMeta: {
        snapshotVersion: 2,
        authorizationTier: 'user_authorized',
        authorizationTierLabel: '用户授权案例',
        reviewStatus: 'approved',
        reviewedAt: '2026-03-16T00:00:00.000Z',
        desensitized: true,
        evidenceLevel: 'partial_images',
        evidenceLevelLabel: '含少量脱敏过程图',
        trustStatement:
          '本案例为用户授权案例；经隐私脱敏与平台审核后公开（快照版本 v2，2026-03-16）。含少量脱敏过程图。价格与方案以快照记录为准，仅供参考。',
        auditLogSummary: '脱敏复核通过；平台合规审核通过',
        publicImageCount: 2,
      },
    },
  })
  assert.ok(caseGraph['@graph'].some((node) => node['@type'] === 'Article'))
  const article = caseGraph['@graph'].find((node) => node['@type'] === 'Article')
  assert.ok(Array.isArray(article.additionalProperty))
  assert.ok(article.additionalProperty.some((item) => item.name === 'desensitized'))
  assert.ok(article.additionalProperty.some((item) => item.name === 'contentTrustLabels'))
  assert.match(
    article.additionalProperty.find((item) => item.name === 'contentTrustLabels').value,
    /用户授权案例 · 已脱敏 · 已审核/
  )
  assert.ok(article.additionalProperty.some((item) => item.name === 'trustStatement'))
  assert.ok(article.additionalProperty.some((item) => item.name === 'desensitizedLabel'))

  const homeGraph = buildHomePageSchemaGraph({
    baseUrl: base,
    organizationSameAs: ['https://simplewin.cn'],
  })
  const homeOrg = homeGraph['@graph'].find((node) => node['@type'] === 'Organization')
  assert.ok(Array.isArray(homeOrg.sameAs))
  assert.strictEqual(homeOrg.sameAs[0], 'https://simplewin.cn')

  const { buildStorePageSchemaGraph } = require('./schema-graph')
  const storeGraph = buildStorePageSchemaGraph({
    baseUrl: base,
    store: {
      id: 'store_1',
      name: '测试门店',
      transparency: {
        score: 80,
        asOfDate: '2026-07-13',
        summary: '已公开案例与资质',
        dimensions: [
          {
            id: 'public_cases',
            label: '公开案例',
            value: 2,
            displayValue: '2',
            meaning: '公开案例数',
            evidence: {
              type: 'case_list',
              url: '/store/store_1/cases',
              anchor: '#store-cases',
              available: true,
              preview: [{ title: '案例A', path: '/case/a.html' }],
            },
          },
        ],
      },
      faq: [{ q: 'Q', a: 'A' }],
    },
  })
  assert.ok(storeGraph['@graph'].some((node) => node['@type'] === 'AutoRepair'))
  const storeNode = storeGraph['@graph'].find((node) => node['@type'] === 'AutoRepair')
  assert.ok(storeNode.additionalProperty.some((item) => item.name === 'transparencyScore'))

  const emptyStoreGraph = buildStorePageSchemaGraph({
    baseUrl: base,
    store: {
      id: 'store_empty',
      name: '空门店',
      caseCount: 0,
      transparency: {
        exposed: false,
        score: null,
        caseCount: 0,
        summary: '该门店公开案例完善中',
        dimensions: [],
      },
    },
  })
  const emptyNode = emptyStoreGraph['@graph'].find((node) => node['@type'] === 'AutoRepair')
  assert.ok(!(emptyNode.additionalProperty || []).some((item) => item.name === 'transparencyScore'))

  console.log('[schema-graph.test] ok')
}

run()
