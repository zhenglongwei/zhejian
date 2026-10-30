const test = require('node:test')
const assert = require('node:assert/strict')
const {
  HOST_MASK_OUTCOME,
  classifyHostMaskOutcome,
  needsHostMaskAction,
} = require('./host-mask-outcome')

test('clean scan success is ok_no_privacy, not manual', () => {
  const row = classifyHostMaskOutcome({
    status: 'masked_ready',
    maskedUrl: 'https://x/desensitized/a.jpg',
    riskTags: [],
  })
  assert.equal(row.outcome, HOST_MASK_OUTCOME.OK_NO_PRIVACY)
  assert.equal(row.needsManual, false)
  assert.equal(row.publishSafe, true)
  assert.equal(needsHostMaskAction(row.outcome), false)
})

test('detected and stamped is ok_masked', () => {
  const row = classifyHostMaskOutcome({
    desensitizeStatus: 'success',
    maskedUrl: 'https://x/desensitized/b.jpg',
    riskTags: ['plate'],
  })
  assert.equal(row.outcome, HOST_MASK_OUTCOME.OK_MASKED)
  assert.equal(row.needsManual, false)
})

test('detected but stamp failed is ok_detect_mask_failed', () => {
  const row = classifyHostMaskOutcome({
    status: 'mask_failed',
    riskTags: ['face'],
  })
  assert.equal(row.outcome, HOST_MASK_OUTCOME.OK_DETECT_MASK_FAILED)
  assert.equal(row.needsManual, true)
})

test('ocr/network failure without hits is call_failed', () => {
  const row = classifyHostMaskOutcome({
    status: 'mask_failed',
    riskTags: [],
  })
  assert.equal(row.outcome, HOST_MASK_OUTCOME.CALL_FAILED)
  assert.equal(row.needsManual, true)
})

test('need_manual media is detect_mask_failed', () => {
  const row = classifyHostMaskOutcome({
    desensitizeStatus: 'need_manual',
    riskTags: ['plate'],
  })
  assert.equal(row.outcome, HOST_MASK_OUTCOME.OK_DETECT_MASK_FAILED)
  assert.equal(needsHostMaskAction(row.outcome), true)
})

test('untouched asset stays pending and needs remask', () => {
  const row = classifyHostMaskOutcome({ status: 'raw_uploaded' })
  assert.equal(row.outcome, HOST_MASK_OUTCOME.PENDING)
  assert.equal(row.maskSucceeded, false)
  assert.equal(row.needsRemask, true)
  assert.equal(needsHostMaskAction(row.outcome), true)
})

test('ok_no_privacy counts as mask success even without privacy hits', () => {
  const row = classifyHostMaskOutcome({
    status: 'masked_ready',
    maskedUrl: 'https://x/desensitized/clean.jpg',
    riskTags: [],
  })
  assert.equal(row.maskSucceeded, true)
  assert.equal(row.needsRemask, false)
})

test('no marker means not success', () => {
  const row = classifyHostMaskOutcome({})
  assert.equal(row.maskSucceeded, false)
  assert.equal(row.needsRemask, true)
  assert.equal(row.publishSafe, false)
})
