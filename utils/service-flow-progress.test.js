const test = require('node:test')
const assert = require('node:assert/strict')
const { isFlowNodeDone, deliveryReportSent } = require('./service-flow-progress')

test('接车确认不代替保存并开始检测', () => {
  const pending = {
    id: 'fn_001',
    kind: 'intake',
    status: 'in_progress',
    document: { docType: 'intake_confirm', status: 'pending_confirm' },
  }
  const confirmed = {
    ...pending,
    document: { docType: 'intake_confirm', status: 'confirmed' },
  }
  const saved = { ...confirmed, status: 'completed' }
  assert.equal(isFlowNodeDone(pending), false)
  assert.equal(isFlowNodeDone(confirmed), false)
  assert.equal(isFlowNodeDone(saved), true)
})

test('交车发给车主之后，施工不再改', () => {
  const report = (status) => [{ kind: 'repair_report', document: { status } }]
  assert.equal(deliveryReportSent(report('draft')), false)
  assert.equal(deliveryReportSent([]), false)
  assert.equal(deliveryReportSent(report('pending_confirm')), true)
  assert.equal(deliveryReportSent(report('confirmed')), true)
  assert.equal(deliveryReportSent(report('delivered')), true)
})
