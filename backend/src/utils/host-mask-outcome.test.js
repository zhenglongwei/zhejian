const test = require('node:test')
const assert = require('node:assert/strict')
const {
  HOST_MASK_OUTCOME,
  classifyHostMaskOutcome,
  needsHostMaskAction,
  hostMaskAction,
  resolveHostDisplayUrl,
} = require('./host-mask-outcome')

test('clean scan success is ok_no_privacy, not manual', () => {
  const row = classifyHostMaskOutcome({
    status: 'masked_ready',
    maskedUrl: 'https://x/desensitized/a.jpg',
    riskTags: [],
  })
  assert.equal(row.outcome, HOST_MASK_OUTCOME.OK_NO_PRIVACY)
  assert.equal(row.maskSucceeded, true)
  assert.equal(row.publishSafe, true)
  assert.equal(needsHostMaskAction(row.outcome), false)
  assert.equal(hostMaskAction(row.outcome), 'skip')
})

test('detected and stamped is ok_masked', () => {
  const row = classifyHostMaskOutcome({
    desensitizeStatus: 'success',
    maskedUrl: 'https://x/desensitized/b.jpg',
    riskTags: ['plate'],
  })
  assert.equal(row.outcome, HOST_MASK_OUTCOME.OK_MASKED)
  assert.equal(row.maskSucceeded, true)
  assert.equal(hostMaskAction(row.outcome), 'skip')
})

test('detected but stamp failed is mask_failed → registered skip', () => {
  const row = classifyHostMaskOutcome({
    status: 'mask_failed',
    riskTags: ['face'],
  })
  assert.equal(row.outcome, HOST_MASK_OUTCOME.MASK_FAILED)
  assert.equal(hostMaskAction(row.outcome), 'skip')
  assert.equal(needsHostMaskAction(row.outcome), false)
  assert.equal(row.allowsOriginalPublish, true)
})

test('ocr/network failure without hits is llm_failed → registered skip', () => {
  const row = classifyHostMaskOutcome({
    status: 'mask_failed',
    riskTags: [],
  })
  assert.equal(row.outcome, HOST_MASK_OUTCOME.LLM_FAILED)
  assert.equal(hostMaskAction(row.outcome), 'skip')
})

test('need_manual media is mask_failed registered', () => {
  const row = classifyHostMaskOutcome({
    desensitizeStatus: 'need_manual',
    riskTags: ['plate'],
  })
  assert.equal(row.outcome, HOST_MASK_OUTCOME.MASK_FAILED)
  assert.equal(needsHostMaskAction(row.outcome), false)
})

test('untouched asset is not_analyzed and needs llm', () => {
  const row = classifyHostMaskOutcome({ status: 'raw_uploaded' })
  assert.equal(row.outcome, HOST_MASK_OUTCOME.NOT_ANALYZED)
  assert.equal(row.maskSucceeded, false)
  assert.equal(row.needsRemask, true)
  assert.equal(hostMaskAction(row.outcome), 'rerun_llm')
})

test('legacy pending / call_failed normalize via explicit maskOutcome', () => {
  assert.equal(
    classifyHostMaskOutcome({ maskOutcome: 'pending' }).outcome,
    HOST_MASK_OUTCOME.NOT_ANALYZED,
  )
  assert.equal(
    classifyHostMaskOutcome({ maskOutcome: 'call_failed' }).outcome,
    HOST_MASK_OUTCOME.LLM_FAILED,
  )
  assert.equal(hostMaskAction('ok_detect_mask_failed'), 'skip')
  assert.equal(hostMaskAction('llm_failed'), 'skip')
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

test('media success with empty product is ok_no_privacy (show original)', () => {
  const row = classifyHostMaskOutcome({
    desensitizeStatus: 'success',
    maskedUrl: '',
    riskTags: [],
  })
  assert.equal(row.outcome, HOST_MASK_OUTCOME.OK_NO_PRIVACY)
  assert.equal(row.publishSafe, true)
  assert.equal(row.maskSucceeded, true)
  assert.equal(row.needsRemask, false)
})

test('explicit node maskOutcome ok_no_privacy wins without product url', () => {
  const row = classifyHostMaskOutcome({
    maskOutcome: 'ok_no_privacy',
    maskedUrl: '',
    riskTags: [],
  })
  assert.equal(row.outcome, HOST_MASK_OUTCOME.OK_NO_PRIVACY)
  assert.equal(row.publishSafe, true)
})

test('no marker means not_analyzed', () => {
  const row = classifyHostMaskOutcome({})
  assert.equal(row.outcome, HOST_MASK_OUTCOME.NOT_ANALYZED)
  assert.equal(row.maskSucceeded, false)
  assert.equal(row.needsRemask, true)
  assert.equal(row.publishSafe, true)
  assert.equal(row.allowsOriginalPublish, true)
})

test('resolveHostDisplayUrl prefers masked then original', () => {
  assert.equal(
    resolveHostDisplayUrl(
      { maskOutcome: 'ok_masked', maskedUrl: 'https://x/m.jpg', url: 'https://x/r.jpg' },
    ),
    'https://x/m.jpg',
  )
  assert.equal(
    resolveHostDisplayUrl({ maskOutcome: 'ok_no_privacy', url: 'https://x/r.jpg' }),
    'https://x/r.jpg',
  )
  assert.equal(
    resolveHostDisplayUrl({ maskOutcome: 'llm_failed', url: 'https://x/r.jpg' }),
    'https://x/r.jpg',
  )
  assert.equal(
    resolveHostDisplayUrl({ maskOutcome: 'not_analyzed', url: 'https://x/r.jpg' }),
    'https://x/r.jpg',
  )
})
