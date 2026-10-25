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

test('交车报告用完整车牌，合计用报价金额', () => {
  const preview = buildOwnerPreviewDoc({
    family: 'finish',
    album: {
      storeName: '杭州盈简科技有限公司',
      vehicle: {
        plate: '粤B12345',
        plateDisplay: '粤B****5',
        brand: '大众',
        series: '高尔夫',
      },
    },
    mileageText: '里程 10,000 km',
    workItems: [
      { name: '更换下摆臂胶套', note: '更换了已经开裂的下摆臂胶套', amount: '' },
    ],
    totalAmount: 1400,
  })
  assert.equal(preview.doc.metaLine, '粤B12345 · 大众 高尔夫 · 里程 10,000 km')
  assert.equal(preview.doc.totalAmountLabel, '合计 ¥1400.00')
})

test('交车报告带上全车和其他交车图', () => {
  const preview = buildOwnerPreviewDoc({
    family: 'finish',
    deliveryPhotos: [{ url: 'from-work.jpg' }, { url: 'uploaded.jpg' }, { url: 'from-work.jpg' }],
  })
  assert.deepEqual(
    preview.doc.deliveryPhotos.map((row) => row.url),
    ['from-work.jpg', 'uploaded.jpg'],
  )
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
