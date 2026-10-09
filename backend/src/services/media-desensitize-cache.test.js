const test = require('node:test')
const assert = require('node:assert/strict')
const {
  DESENSITIZE_STATUS,
  isDesensitizeTerminal,
  shouldSkipRerunDesensitize,
} = require('./media.service')

test('success need_manual and failed are terminal desensitize states', () => {
  assert.equal(isDesensitizeTerminal({ desensitizeStatus: DESENSITIZE_STATUS.SUCCESS }), true)
  assert.equal(isDesensitizeTerminal({ desensitizeStatus: DESENSITIZE_STATUS.NEED_MANUAL }), true)
  assert.equal(isDesensitizeTerminal({ desensitizeStatus: DESENSITIZE_STATUS.FAILED }), true)
  assert.equal(isDesensitizeTerminal({ desensitizeStatus: DESENSITIZE_STATUS.PENDING }), false)
})

test('need_manual is not rerun unless force', () => {
  const media = { desensitizeStatus: DESENSITIZE_STATUS.NEED_MANUAL }
  assert.equal(shouldSkipRerunDesensitize(media, {}), true)
  assert.equal(shouldSkipRerunDesensitize(media, { force: true }), false)
})

test('failed is not rerun unless force', () => {
  const media = { desensitizeStatus: DESENSITIZE_STATUS.FAILED }
  assert.equal(shouldSkipRerunDesensitize(media, {}), true)
  assert.equal(shouldSkipRerunDesensitize(media, { force: true }), false)
})
