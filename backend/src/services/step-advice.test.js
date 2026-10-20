const test = require('node:test')
const assert = require('node:assert/strict')
const { parseWorkAdvice, parseDeliveryAdvice } = require('./step-advice.service')

test('施工不一致时只指出补充报价或补图', () => {
  const got = parseWorkAdvice({
    note: '随便一句',
    gaps: [
      { title: '下摆臂', body: '报价有这项，施工还没有图。', action: 'photo' },
      { title: '平衡杆', body: '报价里没有，去补充报价。', action: 'addon' },
      { title: '平衡杆', body: '再来一条', action: 'other' },
    ],
  })
  assert.equal(got.note, '')
  assert.equal(got.gaps.length, 3)
  assert.equal(got.gaps[0].action, 'photo')
  assert.equal(got.gaps[1].action, 'addon')
  assert.equal(got.gaps[2].action, 'addon')
})

test('施工对得上时不列缺口', () => {
  const got = parseWorkAdvice({ note: '和报价对得上', gaps: [] })
  assert.equal(got.note, '和报价对得上')
  assert.equal(got.gaps.length, 0)
})

test('交车分成维修、质保、用车', () => {
  const got = parseDeliveryAdvice({
    repair: { title: '这次维修', body: '换了下摆臂胶套。' },
    warranty: { title: '质保', body: '已写 1 年。' },
    care: { title: '用车', body: '过坎时听一下还有没有响。' },
  })
  assert.equal(got.repair.body, '换了下摆臂胶套。')
  assert.equal(got.warranty.body, '已写 1 年。')
  assert.match(got.care.body, /过坎/)
})
