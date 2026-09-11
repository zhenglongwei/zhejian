/**
 * 托管店页 FAQ 题库 / 空答过滤 / 低质答拦截
 */
const assert = require('assert')
const {
  buildHostedStorefrontFaq,
  filterPublishableFaq,
  caseHasAnswerMaterial,
  isLowInfoFaqAnswer,
} = require('../utils/hosted-storefront-faq')
const { getHostedStorefrontFaqBank: getBank } = require('../constants/hosted-storefront-faq-bank')

function testMaintenanceBank() {
  const pack = buildHostedStorefrontFaq({
    serviceName: '小保养',
    geo: {},
    answeredFaq: [],
  })
  assert.equal(pack.categoryId, 'maintenance')
  assert.ok(pack.faq.length >= 4, '保养应预置多条问')
  assert.ok(pack.faq.every((row) => row.q && !row.a), '薄案例答应空')
  assert.equal(filterPublishableFaq(pack.faq).length, 0, '空答不上网')
}

function testChassisMoreQuestions() {
  const bankQ = getBank('chassis_noise').questions[0]
  const pack = buildHostedStorefrontFaq({
    serviceName: '底盘维修',
    geo: { faultDesc: '异响', inspectResult: '胶套老化', repairPlan: '更换下摆臂胶套' },
    answeredFaq: [
      {
        q: bankQ,
        a: '平时常见先查胶套、球头和连杆；本单检查为胶套老化，已更换下摆臂胶套，减轻异响来源。',
      },
    ],
  })
  assert.equal(pack.categoryId, 'chassis_noise')
  assert.ok(pack.faq.length >= 5, '底盘题更多')
  assert.ok(pack.hasMaterial)
  const published = filterPublishableFaq(pack.faq)
  assert.equal(published.length, 1)
  assert.ok(published[0].a.includes('胶套'))
}

function testRejectThinAnswer() {
  assert.equal(isLowInfoFaqAnswer('后门'), true)
  assert.equal(isLowInfoFaqAnswer('机油'), true)
  const pack = buildHostedStorefrontFaq({
    serviceName: '钣金喷漆',
    geo: { faultDesc: '后门凹陷', repairPlan: '钣金喷漆' },
    answeredFaq: [{ q: '这次主要修了什么？', a: '后门' }],
  })
  assert.equal(filterPublishableFaq(pack.faq).length, 0, '极简答不得公开')
  assert.ok(
    !pack.faq.some((row) => row.a === '后门'),
    '低质答应被清空为待填',
  )
  assert.equal(filterPublishableFaq([{ q: '这次主要修了什么？', a: '后门' }]).length, 0)
}

function testMaterialGate() {
  assert.equal(caseHasAnswerMaterial({}, { serviceName: '保养' }), false)
  assert.equal(caseHasAnswerMaterial({ inspectResult: '机油变质需更换' }, {}), true)
}

testMaintenanceBank()
testChassisMoreQuestions()
testRejectThinAnswer()
testMaterialGate()
console.log('hosted-storefront-faq.test.js OK')
