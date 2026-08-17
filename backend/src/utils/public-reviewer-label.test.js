const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { maskReviewerDigits, publicReviewerLabel } = require('./public-reviewer-label')

describe('publicReviewerLabel', () => {
  it('masks middle digits', () => {
    assert.equal(maskReviewerDigits('128347'), '12***47')
  })

  it('is stable for the same user and hides the raw id', () => {
    const a = publicReviewerLabel('user_abc')
    const b = publicReviewerLabel('user_abc')
    const c = publicReviewerLabel('user_xyz')
    assert.equal(a, b)
    assert.notEqual(a, c)
    assert.match(a, /^车主 \d{2}\*\*\*\d{2}$/)
    assert.equal(a.includes('user_abc'), false)
  })
})
