/**
 * 托管店页 FAQ 题库 / 空答过滤 / 低质答拦截
 */
const assert = require('assert')
const {
  buildHostedStorefrontFaq,
  filterPublishableFaq,
  caseHasAnswerMaterial,
  isLowInfoFaqAnswer,
  collectHostedCaseFaq,
} = require('../utils/hosted-storefront-faq')

function testMaintenanceBank() {
  const pack = buildHostedStorefrontFaq({
    serviceName: '小保养',
    geo: {},
    answeredFaq: [],
  })
  assert.equal(pack.categoryId, 'maintenance')
  assert.equal(pack.faq.length, 1, '没有亮点时只留一条缺项叮嘱')
  assert.ok(pack.faq[0].a.includes('质保期'))
  assert.equal(filterPublishableFaq(pack.faq).length, 1, '短叮嘱可以上网')
  assert.ok(Array.isArray(pack.directions) && pack.directions.length >= 3)
}

function testChassisKeepsHighlightAndGap() {
  const pack = buildHostedStorefrontFaq({
    serviceName: '底盘维修',
    geo: { faultDesc: '异响', inspectResult: '胶套老化', repairPlan: '更换下摆臂胶套' },
    answeredFaq: [
      {
        q: '这例查出了什么、怎么处理？',
        a: '这例公开档案里，检查为胶套老化，已更换下摆臂胶套，异响来源已经处理。',
      },
    ],
  })
  assert.equal(pack.categoryId, 'chassis_noise')
  assert.ok(pack.hasMaterial)
  const published = filterPublishableFaq(pack.faq)
  assert.equal(published.length, 2, '亮点之后补一条缺项叮嘱')
  assert.ok(published[0].a.includes('胶套'))
  assert.ok(published[1].a.includes('质保期'))
}

function testSkipGapWhenThemeCovered() {
  const pack = buildHostedStorefrontFaq({
    serviceName: '钣金喷漆',
    geo: { faultDesc: '后门凹陷', repairPlan: '钣金喷漆', resultConfirm: '漆面质保一年' },
    answeredFaq: [
      {
        q: '这例质保怎么写的？',
        a: '这例写了漆面质保一年。修完后要向商家确定质保期，以及不含哪些。',
      },
    ],
  })
  assert.equal(pack.faq.length, 1, '已有质保亮点就不再补空叮嘱')
}

function testRejectThinAnswer() {
  assert.equal(isLowInfoFaqAnswer('后门'), true)
  assert.equal(isLowInfoFaqAnswer('机油'), true)
  assert.equal(isLowInfoFaqAnswer('修完后要向商家确定质保期'), false)
  const pack = buildHostedStorefrontFaq({
    serviceName: '钣金喷漆',
    geo: { faultDesc: '后门凹陷', repairPlan: '钣金喷漆' },
    answeredFaq: [{ q: '这次主要修了什么？', a: '后门' }],
  })
  assert.ok(!pack.faq.some((row) => row.a === '后门'), '低质答应被丢掉')
  assert.equal(filterPublishableFaq([{ q: '这次主要修了什么？', a: '后门' }]).length, 0)
  assert.equal(filterPublishableFaq(pack.faq).length, 1, '丢掉极简答后仍可留一条叮嘱')
}

function testScreenshotBodyShopAnswerIsPublishable() {
  const published = filterPublishableFaq([
    {
      q: '钣金喷漆大概要走哪些步骤？本单流程？',
      a: '先把旧漆去除，露出底漆。用钣金工具将伤处尽量敲平。关键一步上树脂，防锈。最后上漆。',
    },
  ])
  assert.equal(published.length, 1)
}

function testMaterialGate() {
  assert.equal(caseHasAnswerMaterial({}, { serviceName: '保养' }), false)
  assert.equal(caseHasAnswerMaterial({ inspectResult: '机油变质需更换' }, {}), true)
}

function testCollectHostedFaqPrefersStorefrontLayer() {
  const hosted = [
    {
      q: '这次主要修了什么？',
      a: '本单对右前门划痕做了钣金整形和局部喷漆，交车前核对漆面色差。',
    },
  ]
  const picked = collectHostedCaseFaq({
    contentJson: {
      faq: [],
      hostGeoLayer: { faq: hosted },
      merchantCaseDraft: { faq: [] },
    },
    hostMeta: { faq: [], geoLayer: { faq: hosted } },
    enrichmentFaq: [],
    draftFaq: [],
  })
  assert.equal(picked.length, 1)
  assert.ok(picked[0].a.includes('钣金'))
}

testMaintenanceBank()
testChassisKeepsHighlightAndGap()
testSkipGapWhenThemeCovered()
testRejectThinAnswer()
testScreenshotBodyShopAnswerIsPublishable()
testMaterialGate()
testCollectHostedFaqPrefersStorefrontLayer()
console.log('hosted-storefront-faq.test.js OK')
