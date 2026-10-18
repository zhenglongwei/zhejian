const test = require('node:test')
const assert = require('node:assert/strict')
const { buildOwnerPreviewDoc } = require('./owner-preview-doc')

test('开口活补充报价预览用车主标题和明细', () => {
  const preview = buildOwnerPreviewDoc({
    family: 'quote',
    isAddon: true,
    album: { templateId: 'accident', serviceName: '事故维修', storeName: '辙见店' },
    lines: [{ name: '下摆臂胶套', brand: '原厂', amount: 180, note: '衬套开裂' }],
    discoveryNote: '拆开后看到',
    discoveryImages: ['arm.jpg'],
  })
  assert.equal(preview.hasBody, true)
  assert.equal(preview.doc.title, '补充报价')
  assert.equal(preview.doc.kind, 'addon_quote_confirm')
  assert.equal(preview.doc.lines[0].name, '下摆臂胶套')
  assert.equal(preview.doc.discoveryNote, '拆开后看到')
  assert.deepEqual(preview.doc.discoveryImages, ['arm.jpg'])
  assert.equal(preview.doc.needsConfirm, false)
})

test('检测预览带上检查项，施工不走这张预览', () => {
  const preview = buildOwnerPreviewDoc({
    family: 'inspect',
    chiefComplaint: '底盘异响',
    findings: [{ partName: '下摆臂', result: '需处理', advice: '胶套开裂', images: [{ url: 'a.jpg' }] }],
  })
  assert.equal(preview.doc.kind, 'inspection_report')
  assert.equal(preview.doc.findings[0].partName, '下摆臂')
  assert.equal(preview.doc.findings[0].advice, '胶套开裂')
  assert.equal(buildOwnerPreviewDoc({ family: 'work' }).hasBody, false)
})
