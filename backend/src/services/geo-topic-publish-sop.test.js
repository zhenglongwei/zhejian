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
      summary: '杭州刹车片更换参考与真实案例说明，便于到店前了解。',
      aiSummary: '辙见平台近12个月收录 3 例脱敏案例',
      articleBody:
        '本文汇总杭州地区刹车片更换的常见检查思路、费用影响因素，并结合脱敏案例说明。具体方案与费用以到店检测为准。'.repeat(
          2,
        ),
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
      summary: '短',
      articleBody: '太短',
      relatedCaseIds: [],
    },
    []
  )
  assert.strictEqual(fail.canPublish, false)

  console.log('[geo-topic-publish-sop.test] ok')
}

run()
