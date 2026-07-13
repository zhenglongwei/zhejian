const assert = require('assert')
const {
  assessGeoTopicPublishSop,
  hasDerivedFaq,
} = require('./geo-topic-publish-sop.service')

function run() {
  assert.strictEqual(
    hasDerivedFaq([{ q: 'Q', a: '近12个月收录 3 例脱敏案例' }]),
    true
  )

  const pass = assessGeoTopicPublishSop(
    {
      id: 'p1',
      slug: 'hangzhou-brake-pad',
      pageType: 'city_service',
      city: '杭州',
      aiSummary: '辙见平台近12个月收录 3 例脱敏案例',
      faq: [
        { q: 'Q1', a: '近12个月收录 3 例脱敏案例，仅供参考' },
        { q: 'Q2', a: '需到店检测' },
        { q: 'Q3', a: '价格以门店为准' },
      ],
      relatedCaseIds: ['c1', 'c2', 'c3'],
      serviceId: 'item_brake_pad',
    },
    [
      { id: 'c1', serviceName: '刹车片更换', city: '杭州', seoNoindex: false },
      { id: 'c2', serviceName: '刹车片更换', city: '杭州', seoNoindex: false },
      { id: 'c3', serviceName: '刹车片更换', city: '杭州', seoNoindex: false },
    ]
  )
  assert.strictEqual(pass.canPublish, true)

  const fail = assessGeoTopicPublishSop(
    {
      id: 'p2',
      slug: 'demo-topic',
      pageType: 'fault_qa',
      aiSummary: '仅通用说明',
      faq: [{ q: 'Q1', a: 'A1' }],
      relatedCaseIds: [],
    },
    []
  )
  assert.strictEqual(fail.canPublish, false)

  console.log('[geo-topic-publish-sop.test] ok')
}

run()
