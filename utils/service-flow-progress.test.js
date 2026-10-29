const test = require('node:test')
const assert = require('node:assert/strict')
const { isFlowNodeDone, deliveryReportSent } = require('./service-flow-progress')

test('接车发给车主即完成本步', () => {
  const draft = {
    id: 'fn_001',
    kind: 'intake',
    status: 'in_progress',
    document: { docType: 'intake_confirm', status: 'draft' },
  }
  const delivered = {
    ...draft,
    document: { docType: 'intake_confirm', status: 'delivered' },
  }
  const completed = { ...delivered, status: 'completed' }
  assert.equal(isFlowNodeDone(draft), false)
  assert.equal(isFlowNodeDone(delivered), true)
  assert.equal(isFlowNodeDone(completed), true)
})

test('交车发给车主之后，施工不再改', () => {
  const report = (status) => [{ kind: 'repair_report', document: { status } }]
  assert.equal(deliveryReportSent(report('draft')), false)
  assert.equal(deliveryReportSent([]), false)
  assert.equal(deliveryReportSent(report('pending_confirm')), true)
  assert.equal(deliveryReportSent(report('confirmed')), true)
  assert.equal(deliveryReportSent(report('delivered')), true)
})
