/**
 * 托管店页 FAQ 题库 / 空答过滤
 */
const assert = require('assert')
const {
  buildHostedStorefrontFaq,
  filterPublishableFaq,
  caseHasAnswerMaterial,
} = require('../utils/hosted-storefront-faq')

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
  const pack = buildHostedStorefrontFaq({
    serviceName: '底盘维修',
    geo: { faultDesc: '异响', inspectResult: '胶套老化', repairPlan: '更换下摆臂胶套' },
    answeredFaq: [
      { q: '底盘异响常见原因有哪些？本单查到了什么？', a: '惯例先查胶套球头；本单为胶套老化并更换。' },
    ],
  })
  assert.equal(pack.categoryId, 'chassis_noise')
  assert.ok(pack.faq.length >= 5, '底盘题更多')
  assert.ok(pack.hasMaterial)
  const published = filterPublishableFaq(pack.faq)
  assert.equal(published.length, 1)
  assert.ok(published[0].a.includes('胶套'))
}

function testMaterialGate() {
  assert.equal(caseHasAnswerMaterial({}, { serviceName: '保养' }), false)
  assert.equal(
    caseHasAnswerMaterial({ inspectResult: '机油变质需更换' }, {}),
    true,
  )
}

testMaintenanceBank()
testChassisMoreQuestions()
testMaterialGate()
console.log('hosted-storefront-faq.test.js OK')
