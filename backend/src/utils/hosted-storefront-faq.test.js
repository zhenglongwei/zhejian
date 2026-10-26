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

/** 公开答案需 ≥30 字（MIN_PUBLISH_ANSWER_LEN），否则会被判为低质过滤掉 */
const MACHINE_FAQ = [
  {
    q: '机器生成的问法：这例做了什么？',
    a: '这例公开档案里，机器写了更换机油与机滤两项，属于常规保养范围内的项目，交车前做了复查。',
  },
]
const MANUAL_FAQ = [
  {
    q: '门店改过的问法：这例做了什么？',
    a: '这例公开档案里，门店写明更换全合成机油与机滤，并交代了下次保养里程。',
  },
]

/** 人工改稿直接覆盖机器草稿（老板 2026-10-26 定：FAQ 按摘要的方式处理） */
function testManualFaqOverrideWinsOverMachineDraft() {
  const picked = collectHostedCaseFaq({
    contentJson: { faq: MACHINE_FAQ, hostGeoLayer: { faq: MACHINE_FAQ } },
    hostMeta: { faq: MANUAL_FAQ, faqOverridden: true, geoLayer: { faq: MACHINE_FAQ } },
    enrichmentFaq: [],
    draftFaq: [],
  })
  assert.equal(picked.length, 1)
  assert.ok(picked[0].q.includes('门店改过'), '人工改稿必须覆盖机器草稿')
  assert.ok(!picked[0].q.includes('机器生成'), '机器草稿不得出现在结果里')
}

/** 人工清空也是明确意图，不该把机器稿又捞回来 */
function testManualFaqClearedStaysEmpty() {
  const picked = collectHostedCaseFaq({
    contentJson: { faq: MACHINE_FAQ, hostGeoLayer: { faq: MACHINE_FAQ } },
    hostMeta: { faq: [], faqOverridden: true, geoLayer: { faq: MACHINE_FAQ } },
    enrichmentFaq: [],
    draftFaq: [],
  })
  assert.equal(picked.length, 0, '人工清空后不应回退到机器稿')
}

/** 未人工改过的存量数据：保留原有回退行为，不能开天窗 */
function testLegacyFaqFallsBackToMachineDraft() {
  const picked = collectHostedCaseFaq({
    contentJson: { faq: [], hostGeoLayer: { faq: MACHINE_FAQ } },
    hostMeta: { faq: [], geoLayer: { faq: MACHINE_FAQ } },
    enrichmentFaq: [],
    draftFaq: [],
  })
  assert.equal(picked.length, 1)
  assert.ok(picked[0].q.includes('机器生成'), '未人工改过时应回退到机器稿')
}

/** 生效稿优先：确认公开时已把机器稿写进 hostMeta.faq 的情形 */
function testEffectiveDraftPreferredBeforeFallback() {
  const picked = collectHostedCaseFaq({
    contentJson: { faq: [], hostGeoLayer: { faq: MACHINE_FAQ } },
    hostMeta: { faq: MACHINE_FAQ },
    enrichmentFaq: [],
    draftFaq: [],
  })
  assert.equal(picked.length, 1)
}

testMaintenanceBank()
testChassisKeepsHighlightAndGap()
testSkipGapWhenThemeCovered()
testRejectThinAnswer()
testScreenshotBodyShopAnswerIsPublishable()
testMaterialGate()
testCollectHostedFaqPrefersStorefrontLayer()
testManualFaqOverrideWinsOverMachineDraft()
testManualFaqClearedStaysEmpty()
testLegacyFaqFallsBackToMachineDraft()
testEffectiveDraftPreferredBeforeFallback()
console.log('hosted-storefront-faq.test.js OK')
