const test = require('node:test')
const assert = require('node:assert/strict')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const {
  canUserAccessAlbum,
  isAlbumWithdrawable,
} = require('./service-album.service')
const { assertPublicCasePublishable } = require('./public-case.service')

test('canUserAccessAlbum matches userId or phone', () => {
  const album = { userId: 'user_a', userPhone: '13800000001' }
  assert.equal(canUserAccessAlbum(album, 'user_a', ''), true)
  assert.equal(canUserAccessAlbum(album, 'user_b', '13800000001'), true)
  assert.equal(canUserAccessAlbum(album, 'user_b', '13800000002'), false)
})

test('isAlbumWithdrawable requires authorized and already published', () => {
  assert.equal(
    isAlbumWithdrawable({
      authorization: { status: 'authorized' },
      publicCase: { status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED },
    }),
    true
  )
  assert.equal(
    isAlbumWithdrawable({
      authorization: { status: 'authorized' },
      publicCase: { status: PUBLIC_CASE_STATUS.NEED_MODIFY },
    }),
    true
  )
  // 案例审通过、车主尚未发布：不可撤回
  assert.equal(
    isAlbumWithdrawable({
      authorization: null,
      publicCase: { status: PUBLIC_CASE_STATUS.REVIEW_PASSED },
    }),
    false
  )
  assert.equal(
    isAlbumWithdrawable({
      authorization: { status: 'authorized' },
      publicCase: { status: PUBLIC_CASE_STATUS.REVIEW_PASSED },
    }),
    false
  )
  assert.equal(
    isAlbumWithdrawable({
      authorization: { status: 'authorized' },
      publicCase: { status: PUBLIC_CASE_STATUS.PENDING_REVIEW },
    }),
    false
  )
  assert.equal(
    isAlbumWithdrawable({
      authorization: { status: 'authorized' },
      publicCase: { status: PUBLIC_CASE_STATUS.OFFLINE },
    }),
    false
  )
  assert.equal(isAlbumWithdrawable({ authorization: null }), false)
})

test('assertPublicCasePublishable allows review_passed and offline', () => {
  assert.doesNotThrow(() =>
    assertPublicCasePublishable({ status: PUBLIC_CASE_STATUS.REVIEW_PASSED })
  )
  assert.doesNotThrow(() =>
    assertPublicCasePublishable({ status: PUBLIC_CASE_STATUS.OFFLINE })
  )
})

test('assertPublicCasePublishable blocks pending, rejected, approved', () => {
  assert.throws(
    () => assertPublicCasePublishable(null),
    (err) => err.code === 'CASE_REVIEW_REQUIRED'
  )
  assert.throws(
    () => assertPublicCasePublishable({ status: PUBLIC_CASE_STATUS.PENDING_REVIEW }),
    (err) => err.status === 409
  )
  assert.throws(
    () => assertPublicCasePublishable({ status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED }),
    (err) => err.status === 409
  )
  assert.throws(
    () => assertPublicCasePublishable({ status: PUBLIC_CASE_STATUS.REJECTED }),
    (err) => err.code === 'CASE_REVIEW_REJECTED'
  )
})
