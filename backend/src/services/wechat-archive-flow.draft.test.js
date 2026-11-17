const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  buildStandardFlowNodes,
  QUOTE_CONFIRM_COPY,
} = require('../../vendor/shared/constants/service-flow-nodes')
const { applyDraftToNodes } = require('./wechat-archive-flow.service')

const DRAFT = {
  chiefComplaint: '过减速带右前轮咯噔响',
  mileageKm: 52000,
  vehicleBrand: '本田',
  vehicleSeries: '雅阁',
  intakeFindings: [
    {
      partName: '前刹车片',
      result: 'action',
      advice: '建议更换',
      url: '',
      caption: '',
      imageId: '',
    },
  ],
  quoteLines: [{ name: '更换前刹车片', brand: '博世', amount: 680, note: '' }],
  workFindings: [
    {
      partName: '前刹车片',
      url: '',
      caption: '',
      imageId: '',
      images: [],
      result: '',
      advice: '',
    },
  ],
  handover: '已交车并说明保修',
}

test('微信归档新相册：接车/工单/完工只写 content', () => {
  const nodes = applyDraftToNodes(buildStandardFlowNodes(), DRAFT)

  const intake = nodes.find((n) => n.kind === 'intake')
  assert.equal(intake.content.chiefComplaint, DRAFT.chiefComplaint)
  assert.equal(intake.content.mileageKm, 52000)
  assert.equal(intake.content.vehicleBrand, '本田')
  assert.equal(intake.content.findings[0].partName, '前刹车片')
  assert.equal(intake.photoDraft, undefined)

  const work = nodes.find((n) => n.kind === 'work')
  assert.equal(work.content.findings[0].partName, '前刹车片')
  assert.equal(work.photoDraft, undefined)

  const delivery = nodes.find((n) => n.kind === 'delivery_photos')
  assert.equal(delivery.content.warrantyNotes, DRAFT.handover)
  assert.equal(delivery.photoDraft, undefined)

  nodes.forEach((node) => {
    assert.equal(Object.prototype.hasOwnProperty.call(node, 'photoDraft'), false)
  })
})

test('微信归档新相册：报价写 content，document 只留信封', () => {
  const nodes = applyDraftToNodes(buildStandardFlowNodes(), DRAFT)
  const quote = nodes.find((n) => n.kind === 'quote_confirm')

  assert.equal(quote.content.lines.length, 1)
  assert.equal(quote.content.lines[0].name, '更换前刹车片')
  assert.equal(quote.content.confirmCopy, QUOTE_CONFIRM_COPY)
  assert.equal(quote.document.payload, undefined)
  assert.equal(quote.document.status, 'draft')
  assert.equal(quote.photoDraft, undefined)
})

test('微信归档新相册：无报价行时保留空表单占位', () => {
  const nodes = applyDraftToNodes(buildStandardFlowNodes(), { ...DRAFT, quoteLines: [] })
  const quote = nodes.find((n) => n.kind === 'quote_confirm')
  assert.deepEqual(quote.content.lines, [{ name: '', amount: '', note: '' }])
})
