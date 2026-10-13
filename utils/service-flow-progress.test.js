const test = require('node:test')
const assert = require('node:assert/strict')
const { isFlowNodeDone } = require('./service-flow-progress')

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
