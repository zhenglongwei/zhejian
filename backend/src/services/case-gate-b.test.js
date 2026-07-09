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
  assert.equal(payload.desensitizePreviewSource, 'review')
})

test('B gate reject keeps merchant album locked when compliance passed + authorized', () => {
  assert.equal(
    isAlbumContentLocked({
      complianceStatus: 'passed',
      authorization: { status: 'authorized' },
    }),
    true
  )
})
