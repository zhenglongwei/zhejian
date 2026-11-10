const test = require('node:test')
const assert = require('node:assert/strict')
const { buildOwnerPreviewDoc } = require('./owner-preview-doc')

/** 交车报告验收项（acceptanceItems · 2026-11-10 二次收敛）：一张清单，外观末行，只有图片/结果/描述 */
test('交车报告验收项：新结构映射结果文案与色档（外观末行）', () => {
  const preview = buildOwnerPreviewDoc({
    family: 'finish',
    album: { templateId: 'brake', serviceName: '刹车维修', storeName: '辙见店' },
    acceptanceItems: [
      { id: 'a1', kind: 'work', name: '制动踏板回弹', note: '实车试踩回弹正常', result: 'pass' },
      { id: 'a2', kind: 'work', name: '修复面色差', note: '自然光下仍有轻微色差', result: 'observe' },
      {
        id: 'exterior',
        kind: 'exterior',
        name: '外观',
        note: '整车外观干净',
        result: 'pass',
        images: [{ url: 'https://cdn.example.com/finish.jpg' }],
      },
    ],
  })
  const items = preview.doc.acceptanceItems
  assert.equal(items.length, 3)
  assert.equal(items[0].name, '制动踏板回弹')
  assert.equal(items[0].resultLabel, '合格')
  assert.equal(items[0].resultTone, 'pass')
  assert.equal(items[0].note, '实车试踩回弹正常')
  assert.equal(items[1].resultLabel, '建议观察')
  assert.equal(items[1].resultTone, 'observe')
  // 外观固定最后一行，图挂在这一行
  assert.equal(items[2].name, '外观')
  assert.equal(items[2].kind, 'exterior')
  assert.equal(items[2].images.length, 1)
  // 不再有标准 / 怎么验两个字段
  assert.equal(items[0].standard, undefined)
  assert.equal(items[0].method, undefined)
})

test('交车报告验收项：外观行即使排在最前也归到末行', () => {
  const preview = buildOwnerPreviewDoc({
    family: 'finish',
    album: { templateId: 'brake', serviceName: '刹车维修', storeName: '辙见店' },
    acceptanceItems: [
      { id: 'exterior', kind: 'exterior', name: '外观', result: 'pass' },
      { id: 'a1', kind: 'work', name: '制动踏板回弹', result: 'pass' },
    ],
  })
  const items = preview.doc.acceptanceItems
  assert.equal(items[0].name, '制动踏板回弹')
  assert.equal(items[1].name, '外观')
})

test('交车报告验收项：旧 acceptance 不再映射（旧数据由迁移脚本搬）', () => {
  const preview = buildOwnerPreviewDoc({
    family: 'finish',
    album: { templateId: 'brake', serviceName: '刹车维修', storeName: '辙见店' },
    acceptance: { items: [{ project: '刹车片更换', note: '举升复查力矩到位' }] },
  })
  assert.deepEqual(preview.doc.acceptanceItems, [])
})

test('交车报告验收项：rework 结果也原样映射（硬拦在上游，报告侧只展示）', () => {
  const preview = buildOwnerPreviewDoc({
    family: 'finish',
    album: { templateId: 'brake', serviceName: '刹车维修', storeName: '辙见店' },
    acceptanceItems: [{ id: 'a1', kind: 'work', name: '路试', note: '低速仍有异响', result: 'rework' }],
  })
  assert.equal(preview.doc.acceptanceItems[0].resultLabel, '需返工')
  assert.equal(preview.doc.acceptanceItems[0].resultTone, 'rework')
})
