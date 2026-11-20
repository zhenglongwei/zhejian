const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeGateBRejectType,
  buildGateBUserPayload,
  GATE_B_REJECT_TYPE,
} = require('../constants/case-gate-b')
const { isAlbumContentLocked } = require('./service-album.service')

test('normalizeGateBRejectType maps desensitize alias', () => {
  assert.equal(normalizeGateBRejectType('desensitize').type, GATE_B_REJECT_TYPE.DESENSITIZE_INCOMPLETE)
})

test('normalizeGateBRejectType rejects gate A compliance types', () => {
  assert.equal(normalizeGateBRejectType('compliance').error, 'GATE_A_ONLY')
  assert.equal(normalizeGateBRejectType('banned_phrase').error, 'GATE_A_ONLY')
})

test('buildGateBUserPayload for need_modify', () => {
  const payload = buildGateBUserPayload({
    status: 'need_modify',
    gateBRejectType: GATE_B_REJECT_TYPE.REVIEW_CONTENT,
    gateBRejectReason: '评价含联系方式',
  })
  assert.equal(payload.rejectType, GATE_B_REJECT_TYPE.REVIEW_CONTENT)
  assert.equal(payload.canResubmitPublicCase, true)
  assert.ok(payload.userActions.includes('edit_review'))
})

test('评价配图驳回只让车主更换配图，不再引导去脱敏预览', () => {
  const payload = buildGateBUserPayload({
    status: 'need_modify',
    gateBRejectType: GATE_B_REJECT_TYPE.REVIEW_IMAGE,
  })
  assert.deepEqual(payload.userActions, ['edit_review', 'resubmit_public_case'])
})

test('B gate reject unlocks merchant album when case rejected', () => {
  assert.equal(
    isAlbumContentLocked({
      status: 'completed',
      publicCase: { status: 'rejected' },
      authorization: { status: 'none' },
    }),
    false
  )
})

test('case pending_review keeps merchant album locked', () => {
  assert.equal(
    isAlbumContentLocked({
      status: 'completed',
      publicCase: { status: 'pending_review' },
    }),
    true
  )
})
