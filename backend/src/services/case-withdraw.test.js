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

test('isAlbumWithdrawable requires authorized and non-offline publicCase', () => {
  assert.equal(
    isAlbumWithdrawable({
      authorization: { status: 'authorized' },
      publicCase: { status: PUBLIC_CASE_STATUS.PENDING_REVIEW },
    }),
    true
  )
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
      publicCase: null,
    }),
    true
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

test('assertPublicCasePublishable allows first publish and re-auth from offline', () => {
  assert.doesNotThrow(() => assertPublicCasePublishable(null))
  assert.doesNotThrow(() =>
    assertPublicCasePublishable({ status: PUBLIC_CASE_STATUS.OFFLINE })
  )
})

test('assertPublicCasePublishable blocks duplicate pending or approved', () => {
  assert.throws(
    () => assertPublicCasePublishable({ status: PUBLIC_CASE_STATUS.PENDING_REVIEW }),
    (err) => err.status === 409
  )
  assert.throws(
    () => assertPublicCasePublishable({ status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED }),
    (err) => err.status === 409
  )
  assert.throws(
    () => assertPublicCasePublishable({ status: PUBLIC_CASE_STATUS.NEED_MODIFY }),
    (err) => err.status === 409
  )
})
