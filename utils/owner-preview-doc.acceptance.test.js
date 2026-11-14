const test = require('node:test')
const assert = require('node:assert/strict')
const { buildOwnerPreviewDoc } = require('./owner-preview-doc')

/** 交车报告（2026-11-14）：验收已前移到施工节点，报告不再出验收清单，只保留施工项目说明与图片 */
test('交车报告：不再输出验收清单，施工项目保留说明与图片', () => {
  const preview = buildOwnerPreviewDoc({
    family: 'finish',
    album: { templateId: 'brake', serviceName: '刹车维修', storeName: '辙见店' },
    workItems: [
      {
        name: '制动踏板回弹',
        note: '更换制动总泵后排气，踏板回弹正常。',
        images: [{ url: 'https://cdn.example.com/work.jpg' }],
      },
    ],
    acceptanceItems: [
      { id: 'a1', kind: 'work', name: '制动踏板回弹', note: '实车试踩回弹正常', result: 'pass' },
    ],
  })
  assert.equal(preview.doc.acceptanceItems, undefined)
  assert.equal(preview.doc.workItems.length, 1)
  assert.equal(preview.doc.workItems[0].note, '更换制动总泵后排气，踏板回弹正常。')
  assert.equal(preview.doc.workItems[0].images.length, 1)
})

test('交车报告：只有旧验收项时不再生成验收清单，也不算有正文', () => {
  const preview = buildOwnerPreviewDoc({
    family: 'finish',
    album: { templateId: 'brake', serviceName: '刹车维修', storeName: '辙见店' },
    acceptanceItems: [
      { id: 'a1', kind: 'work', name: '路试', note: '低速仍有异响', result: 'rework' },
    ],
  })
  assert.equal(preview.doc.acceptanceItems, undefined)
  assert.deepEqual(preview.doc.workItems, [])
  assert.equal(preview.hasBody, false)
})

test('交车报告：外观看图不再影响报告正文判定', () => {
  const preview = buildOwnerPreviewDoc({
    family: 'finish',
    album: { templateId: 'brake', serviceName: '刹车维修', storeName: '辙见店' },
    acceptanceItems: [
      {
        id: 'exterior',
        kind: 'exterior',
        name: '外观',
        result: 'pass',
        images: [{ url: 'https://cdn.example.com/finish.jpg' }],
      },
    ],
  })
  assert.equal(preview.doc.acceptanceItems, undefined)
  assert.equal(preview.hasBody, false)
})
