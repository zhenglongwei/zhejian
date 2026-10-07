const test = require('node:test')
const assert = require('node:assert/strict')
const {
  isAckStale,
  isReviewRoundStale,
  canReuseReviewThisRound,
} = require('./node-ai-review-ack')

test('first notify with no review is stale and cannot reuse', () => {
  const node = { aiReview: null }
  assert.equal(isAckStale(node), true)
  assert.equal(canReuseReviewThisRound(node), false)
})

test('ready this round stays valid after text changes', () => {
  const node = {
    aiReview: { status: 'ready', fingerprint: 'aaa', updatedAt: '2026-10-07T01:00:00.000Z' },
  }
  assert.equal(isAckStale(node, { quoteLines: [{ name: '补漆', note: '已改' }] }), false)
  assert.equal(canReuseReviewThisRound(node), true)
})

test('owner reject after last review starts a new round', () => {
  const node = {
    aiReview: { status: 'ready', fingerprint: 'aaa', updatedAt: '2026-10-07T01:00:00.000Z' },
    document: { ownerRejectedAt: '2026-10-07T02:00:00.000Z' },
  }
  assert.equal(isReviewRoundStale(node), true)
  assert.equal(isAckStale(node), true)
  assert.equal(canReuseReviewThisRound(node), false)
})

test('review finished after reject can be acked', () => {
  const node = {
    aiReview: { status: 'ready', updatedAt: '2026-10-07T03:00:00.000Z' },
    document: { ownerRejectedAt: '2026-10-07T02:00:00.000Z' },
  }
  assert.equal(isAckStale(node), false)
  assert.equal(canReuseReviewThisRound(node), true)
})
