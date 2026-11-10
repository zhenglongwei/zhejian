const test = require('node:test')
const assert = require('node:assert/strict')
const { collectDeliveryPhotoDraftGaps, resolveAcceptanceItems } = require('./service-flow-docs')

const acc = (result, name = '制动踏板回弹') => ({
  id: `acc_${name}`,
  name,
  standard: '踏板回弹正常',
  method: '实车试踩',
  images: [],
  note: '',
  result,
})

const filled = {
  warrantyPeriod: '6个月或1万公里',
  delivererName: '李店长',
  deliveryPhotos: [{ url: 'https://out.jpg' }],
  acceptanceItems: [acc('pass'), acc('pass', '路试无异响'), acc('observe', '故障灯')],
}

test('交车确认：外观照 + 逐项结果 + 质保 + 交付人齐则无缺口', () => {
  assert.deepEqual(collectDeliveryPhotoDraftGaps(filled), [])
})

test('交车确认：缺外观照给提示', () => {
  assert.ok(
    collectDeliveryPhotoDraftGaps({ ...filled, deliveryPhotos: [] }).includes(
      '请至少上传 1 张整车外观照',
    ),
  )
})

test('交车确认：没有施工项目时提示先回施工节点', () => {
  assert.ok(
    collectDeliveryPhotoDraftGaps({ ...filled, acceptanceItems: [] }).some((gap) =>
      gap.includes('请先在施工节点确认施工项目'),
    ),
  )
})

test('交车确认：逐项提示缺结果；验收图与文字不拦', () => {
  const gaps = collectDeliveryPhotoDraftGaps({
    ...filled,
    acceptanceItems: [
      { id: 'a1', name: '踏板回弹', standard: '', method: '', images: [], note: '', result: 'pass' },
      { id: 'a2', name: '路试', standard: '无异响', method: '', images: [], note: '', result: '' },
    ],
  })
  assert.ok(gaps.some((gap) => gap.includes('踏板回弹') && gap.includes('请选择验收结果')) === false)
  assert.ok(gaps.some((gap) => gap.includes('「路试」') && gap.includes('请选择验收结果')))
  assert.equal(gaps.length, 1)
})

test('交车确认：任一「需返工」拒绝定稿', () => {
  const gaps = collectDeliveryPhotoDraftGaps({
    ...filled,
    acceptanceItems: [acc('rework'), acc('pass', '路试')],
  })
  assert.ok(gaps.some((gap) => gap.includes('需返工') && gap.includes('重验')))
})

test('交车确认：质保 / 交付人分别提示；简述问答不拦', () => {
  assert.ok(collectDeliveryPhotoDraftGaps({ ...filled, warrantyPeriod: '' }).includes('请填写质保期限'))
  assert.ok(collectDeliveryPhotoDraftGaps({ ...filled, delivererName: '' }).includes('请填写交付人'))
  assert.deepEqual(collectDeliveryPhotoDraftGaps({ ...filled, repairBrief: '', ownerFaqs: [] }), [])
})

test('验收读取：只认 acceptanceItems，旧结构不再映射（旧数据由迁移脚本搬）', () => {
  assert.deepEqual(
    resolveAcceptanceItems({
      acceptance: { items: [{ project: '下摆臂胶套更换', note: '举升复查安装到位' }] },
    }),
    [],
  )
  const items = resolveAcceptanceItems({
    acceptanceItems: [
      {
        id: 'a1',
        name: '胎压',
        standard: '在标准范围',
        method: '胎压表',
        result: 'observe',
        images: [{ url: 'https://x.jpg' }],
      },
    ],
  })
  assert.equal(items.length, 1)
  assert.equal(items[0].result, 'observe')
  assert.equal(items[0].images.length, 1)
})

test('验收读取：没有项目名的行丢弃', () => {
  assert.deepEqual(resolveAcceptanceItems({ acceptanceItems: [{ standard: '无异响' }] }), [])
})
