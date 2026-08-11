const test = require('node:test')
const assert = require('node:assert/strict')
const {
  isCaseReviewPassed,
  isCaseReviewPending,
  isCaseReviewRejected,
  isCaseReviewContentLocked,
  isOwnerAlbumBlocked,
  mapCaseReviewToComplianceCompat,
  assertCaseReviewPassed,
  assertOwnerAlbumAccessible,
} = require('./case-review-gate.service')

test('case review status helpers include pending_desensitize', () => {
  assert.equal(isCaseReviewPending({ publicCase: { status: 'pending_desensitize' } }), true)
  assert.equal(isCaseReviewPending({ publicCase: { status: 'pending_review' } }), true)
  assert.equal(isCaseReviewPassed({ publicCase: { status: 'review_passed' } }), true)
  assert.equal(isCaseReviewPassed({ publicCase: { status: 'public_approved' } }), true)
  assert.equal(isCaseReviewRejected({ publicCase: { status: 'rejected' } }), true)
  assert.equal(
    isCaseReviewContentLocked({ publicCase: { status: 'pending_desensitize' } }),
    true
  )
  assert.equal(isCaseReviewContentLocked({ publicCase: { status: 'rejected' } }), false)
  assert.equal(
    mapCaseReviewToComplianceCompat({ publicCase: { status: 'pending_desensitize' } }),
    'pending'
  )
  assert.equal(mapCaseReviewToComplianceCompat({ publicCase: { status: 'review_passed' } }), 'passed')
})

test('owner album never blocked by case review (2026-08-11)', () => {
  assert.equal(
    isOwnerAlbumBlocked({
      status: 'completed',
      publicCase: { status: 'pending_desensitize' },
    }),
    false
  )
  assert.equal(
    isOwnerAlbumBlocked({
      status: 'completed',
      publicCase: { status: 'pending_review' },
    }),
    false
  )
  assert.equal(
    isOwnerAlbumBlocked({
      status: 'completed',
      publicCase: { status: 'rejected' },
    }),
    false
  )
  assert.equal(
    isOwnerAlbumBlocked({
      status: 'completed',
      publicCase: { status: 'review_passed' },
    }),
    false
  )
  assert.equal(
    isOwnerAlbumBlocked({
      status: 'in_progress',
      publicCase: null,
    }),
    false
  )
  assert.doesNotThrow(() =>
    assertOwnerAlbumAccessible({
      status: 'completed',
      publicCase: { status: 'pending_review' },
    })
  )
  assert.doesNotThrow(() =>
    assertOwnerAlbumAccessible({
      status: 'completed',
      publicCase: { status: 'review_passed' },
    })
  )
})

test('assertCaseReviewPassed', () => {
  assert.doesNotThrow(() =>
    assertCaseReviewPassed({ publicCase: { status: 'review_passed' } })
  )
  assert.throws(
    () => assertCaseReviewPassed({ publicCase: { status: 'pending_desensitize' } }),
    (err) => err.code === 'CASE_REVIEW_PENDING'
  )
  assert.throws(
    () => assertCaseReviewPassed({ publicCase: { status: 'rejected' } }),
    (err) => err.code === 'CASE_REVIEW_REJECTED'
  )
})
