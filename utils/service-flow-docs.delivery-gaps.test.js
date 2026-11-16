const test = require('node:test')
const assert = require('node:assert/strict')
const {
  collectDeliveryPhotoDraftGaps,
  resolveAcceptanceItems,
  normalizeNodeContent,
} = require('./service-flow-docs')

/** 一行验收项：施工项目行 */
const acc = (result, name = '制动踏板回弹') => ({
  id: `acc_${name}`,
  kind: 'work',
  name,
  images: [],
  note: '',
  result,
})

/** 外观行：固定最后一行，至少 1 张图 */
const exterior = (images = [{ url: 'https://out.jpg' }], result = 'pass') => ({
  id: 'exterior',
  kind: 'exterior',
  name: '外观',
  images,
  note: '',
  result,
})

const filled = {
  warrantyPeriod: '6个月或1万公里',
  delivererName: '李店长',
  deliveredAt: '2026-11-13 17:30',
  deliveryMileage: '36800',
  acceptanceItems: [
    acc('pass'),
    acc('pass', '路试无异响'),
    acc('observe', '故障灯'),
    exterior(),
  ],
}

test('交车确认：质保 + 交付人 + 交车时间 + 交付里程齐则无缺口（不再要求逐行结果）', () => {
  assert.deepEqual(
    collectDeliveryPhotoDraftGaps({
      ...filled,
      acceptanceItems: [acc(''), acc('', '路试无异响'), exterior([], '')],
    }),
    [],
  )
})

test('交车确认：缺外观图不再拦（选填，前端弹确认 + payload 留痕）', () => {
  const gaps = collectDeliveryPhotoDraftGaps({
    ...filled,
    acceptanceItems: [acc('pass'), exterior([])],
  })
  assert.equal(gaps.includes('请至少上传 1 张整车外观照'), false)
  assert.deepEqual(gaps, [])
})

test('交车确认：没有施工项目时提示先回施工节点', () => {
  assert.ok(
    collectDeliveryPhotoDraftGaps({ ...filled, acceptanceItems: [exterior()] }).some((gap) =>
      gap.includes('还没有施工项目'),
    ),
  )
})

test('交车确认：不要求逐行结果，施工图缺失也不在交车拦（早已在施工节点锁定）', () => {
  const gaps = collectDeliveryPhotoDraftGaps({
    ...filled,
    acceptanceItems: [
      { id: 'a1', kind: 'work', name: '踏板回弹', images: [], note: '', result: '' },
      { id: 'a2', kind: 'work', name: '路试', images: [], note: '', result: '' },
      exterior(),
    ],
  })
  assert.deepEqual(gaps, [])
})

test('交车确认：外观行无需选结果', () => {
  const gaps = collectDeliveryPhotoDraftGaps({
    ...filled,
    acceptanceItems: [acc('pass'), exterior([{ url: 'https://out.jpg' }], '')],
  })
  assert.deepEqual(gaps, [])
})

test('交车确认：任一「需返工」拒绝定稿', () => {
  const gaps = collectDeliveryPhotoDraftGaps({
    ...filled,
    acceptanceItems: [acc('rework'), acc('pass', '路试'), exterior()],
  })
  assert.ok(gaps.some((gap) => gap.includes('需返工') && gap.includes('重验')))
})

test('交车确认：质保 / 交付人 / 交车时间 / 交车里程分别提示', () => {
  assert.ok(collectDeliveryPhotoDraftGaps({ ...filled, warrantyPeriod: '' }).includes('请填写质保期限'))
  assert.ok(collectDeliveryPhotoDraftGaps({ ...filled, delivererName: '' }).includes('请填写交付人'))
  assert.ok(collectDeliveryPhotoDraftGaps({ ...filled, deliveredAt: '' }).includes('请填写交车时间'))
  assert.ok(collectDeliveryPhotoDraftGaps({ ...filled, deliveryMileage: '' }).includes('请填写交车里程'))
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
        kind: 'work',
        name: '胎压',
        note: '四轮胎压在标准范围',
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
  assert.deepEqual(resolveAcceptanceItems({ acceptanceItems: [{ note: '无异响' }] }), [])
})

test('验收读取：旧外观照并入「外观」行（读侧兼容，不产出旧字段）', () => {
  const content = normalizeNodeContent({
    deliveryPhotos: [{ url: 'https://out.jpg' }],
    acceptanceItems: [acc('pass')],
  })
  const ex = content.acceptanceItems.find((row) => row.kind === 'exterior')
  assert.ok(ex)
  assert.equal(ex.images.length, 1)
  assert.equal(ex.images[0].url, 'https://out.jpg')
  assert.equal(content.deliveryPhotos, undefined)
})
