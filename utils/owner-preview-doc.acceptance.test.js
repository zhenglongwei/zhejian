const test = require('node:test')
const assert = require('node:assert/strict')
const { buildOwnerPreviewDoc } = require('./owner-preview-doc')

/** 交车报告验收项（acceptanceItems · 2026-11-10）映射 */
test('交车报告验收项：新结构映射结果文案与色档', () => {
  const preview = buildOwnerPreviewDoc({
    family: 'finish',
    album: { templateId: 'brake', serviceName: '刹车维修', storeName: '辙见店' },
    acceptanceItems: [
      { id: 'a1', name: '制动踏板回弹', standard: '踏板回弹正常', method: '实车试踩', result: 'pass' },
      { id: 'a2', name: '修复面色差', standard: '自然光下无明显色差', method: '目视', result: 'observe' },
    ],
  })
  const items = preview.doc.acceptanceItems
  assert.equal(items.length, 2)
  assert.equal(items[0].name, '制动踏板回弹')
  assert.equal(items[0].resultLabel, '合格')
  assert.equal(items[0].resultTone, 'pass')
  assert.equal(items[1].resultLabel, '建议观察')
  assert.equal(items[1].resultTone, 'observe')
  assert.equal(items[1].method, '目视')
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
    acceptanceItems: [
      { id: 'a1', name: '路试', standard: '无异响', result: 'rework' },
    ],
  })
  assert.equal(preview.doc.acceptanceItems[0].resultLabel, '需返工')
  assert.equal(preview.doc.acceptanceItems[0].resultTone, 'rework')
})
