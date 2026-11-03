const test = require('node:test')
const assert = require('node:assert/strict')
const { collectDeliveryPhotoDraftGaps } = require('./service-flow-docs')

const filled = {
  repairBrief: '更换下摆臂胶套',
  ownerFaqs: [{ id: 'f1', question: '多久复查？', answer: '建议 500 公里后再看。' }],
  warrantyPeriod: '6个月或1万公里',
  delivererName: '李店长',
  deliveryExteriorUrl: 'https://out.jpg',
}

test('交车确认：四项与整车外观齐则无缺口', () => {
  assert.deepEqual(collectDeliveryPhotoDraftGaps(filled), [])
})

test('交车确认：缺简述 / 问答 / 质保 / 交付人分别提示', () => {
  assert.ok(collectDeliveryPhotoDraftGaps({ ...filled, repairBrief: '' }).includes('请填写本次维修简述'))
  assert.ok(
    collectDeliveryPhotoDraftGaps({ ...filled, ownerFaqs: [] }).includes(
      '请至少填写 1 条车主关心的问题（问+答）',
    ),
  )
  assert.ok(
    collectDeliveryPhotoDraftGaps({
      ...filled,
      ownerFaqs: [{ id: 'f1', question: '只有问', answer: '' }],
    }).includes('请至少填写 1 条车主关心的问题（问+答）'),
  )
  assert.ok(collectDeliveryPhotoDraftGaps({ ...filled, warrantyPeriod: '' }).includes('请填写质保期限'))
  assert.ok(collectDeliveryPhotoDraftGaps({ ...filled, delivererName: '' }).includes('请填写交付人'))
})
