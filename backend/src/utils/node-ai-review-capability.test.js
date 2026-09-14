const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveNodeAiReviewCapability } = require('./node-ai-review-capability')

test('kill switch off: nobody is entitled', () => {
  const cap = resolveNodeAiReviewCapability({ plan: 'index_99', status: 'active' }, {
    enabled: false,
    requirePaid: false,
    llmEnabled: true,
  })
  assert.equal(cap.enabled, false)
  assert.equal(cap.entitled, false)
  assert.equal(cap.llmEnabled, false)
  assert.equal(cap.billing, 'off')
})

test('promo free: all plans entitled, including free', () => {
  const cap = resolveNodeAiReviewCapability({ plan: 'free', status: 'active' }, {
    enabled: true,
    requirePaid: false,
    llmEnabled: true,
  })
  assert.equal(cap.entitled, true)
  assert.equal(cap.billing, 'free')
  assert.equal(cap.llmEnabled, true)
})

test('require paid: free plan not entitled', () => {
  const cap = resolveNodeAiReviewCapability({ plan: 'free', status: 'active' }, {
    enabled: true,
    requirePaid: true,
    paidPlans: ['index_99', 'optimize_299'],
    llmEnabled: true,
  })
  assert.equal(cap.entitled, false)
  assert.equal(cap.reason, 'need_plan')
  assert.equal(cap.llmEnabled, false)
})

test('require paid: listed plan entitled', () => {
  const cap = resolveNodeAiReviewCapability({ plan: 'index_99', status: 'active' }, {
    enabled: true,
    requirePaid: true,
    paidPlans: ['index_99'],
    llmEnabled: false,
  })
  assert.equal(cap.entitled, true)
  assert.equal(cap.llmEnabled, false)
})
