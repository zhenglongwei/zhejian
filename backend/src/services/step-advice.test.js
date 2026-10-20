const test = require('node:test')
const assert = require('node:assert/strict')
const { parseWorkAdvice, parseDeliveryAdvice, parseInspectionAdvice } = require('./step-advice.service')

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

test('检测按已写的发现解释，空发现不编后果', () => {
  const got = parseInspectionAdvice(
    {
      shop: [
        { kind: 'miss', title: '球头', body: '异响要查球头间隙，举升后撬一下。' },
        { kind: 'omit', title: '插头', body: '这项已经有了，不该再算漏。' },
        { kind: 'wrong', title: '轮胎', body: '结果写了关注，发现却是空的。' },
        { kind: 'extra', title: '随便', body: '丢掉。' },
      ],
      items: [
        { id: 'a', body: '接头已经老化。再拖可能接触不良，灯会闪。建议现在处理，不要再拖。' },
        { id: 'b', body: '编一段没写过的漏油。' },
      ],
    },
    [
      { id: 'a', name: '插头', result: '需处理', note: '接头老化' },
      { id: 'b', name: '轮胎', result: '需关注', note: '' },
      { id: 'c', name: '雨刮', result: '状态良好', note: '刮得干净' },
    ],
  )
  assert.equal(got.scope, 'both')
  assert.equal(got.shop.length, 2)
  assert.equal(got.shop[0].kind, 'miss')
  assert.equal(got.shop[1].kind, 'wrong')
  assert.equal(got.items[0].timing, '建议现在处理')
  assert.match(got.items[0].body, /老化/)
  assert.equal(got.items[0].hasReason, true)
  assert.match(got.items[1].body, /还空着/)
  assert.equal(got.items[1].hasReason, false)
  assert.equal(got.items[2].timing, '现在不用动')
  assert.match(got.items[2].body, /刮得干净/)
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
