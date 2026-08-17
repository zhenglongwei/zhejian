const test = require('node:test')
const assert = require('node:assert/strict')
const {
  canMerchantGenerateCase,
  isCaseDraftEditable,
  signOwnerRightsToken,
  verifyOwnerRightsToken,
} = require('./case-publish-window.service')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')

test('canMerchantGenerateCase requires completed album and valid phone', () => {
  const album = {
    status: 'completed',
    userPhone: '13800138000',
    publicCaseStatus: 'private',
    publicCase: null,
  }
  assert.equal(canMerchantGenerateCase(album).ok, true)
  assert.equal(canMerchantGenerateCase({ ...album, status: 'in_progress' }).ok, false)
  assert.equal(canMerchantGenerateCase({ ...album, userPhone: '123' }).ok, false)
  assert.equal(
    canMerchantGenerateCase({
      ...album,
      publicCase: { status: PUBLIC_CASE_STATUS.OWNER_BLOCKED, ownerBlockedAt: new Date() },
    }).ok,
    false,
  )
})

test('isCaseDraftEditable after complete private, not after submit', () => {
  assert.equal(isCaseDraftEditable({ publicCaseStatus: 'private', status: 'completed' }), true)
  assert.equal(
    isCaseDraftEditable({ publicCase: { status: PUBLIC_CASE_STATUS.PENDING_REVIEW } }),
    false,
  )
  assert.equal(
    isCaseDraftEditable({ publicCase: { status: PUBLIC_CASE_STATUS.NOTIFY_WINDOW } }),
    false,
  )
})

test('owner rights token roundtrip', () => {
  const token = signOwnerRightsToken('alb_1', Date.now() + 60_000)
  const parsed = verifyOwnerRightsToken(token)
  assert.ok(parsed)
  assert.equal(parsed.albumId, 'alb_1')
  assert.equal(verifyOwnerRightsToken('nope'), null)
})
