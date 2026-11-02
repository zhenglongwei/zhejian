const assert = require('assert')
const { withSetupTodos, buildMerchantTodoSummary } = require('./merchant-hub')

const unverified = {
  authStatus: 'none',
  setupNext: 'auth',
  publicReady: false,
}
const merged = withSetupTodos(
  buildMerchantTodoSummary({
    pendingUpload: 2,
    pendingFollowUp: 3,
    pendingReviews: 1,
  }),
  unverified
)
assert.strictEqual(merged.items.length, 2)
assert.strictEqual(merged.items[0].action, 'reviews')
assert.strictEqual(merged.items[1].action, 'auth')
assert.strictEqual(merged.items[1].label, '补认证：上传执照与身份证正反面')
assert.strictEqual(merged.headline, '2 项待你处理')
assert.strictEqual(
  merged.items.some((item) => item.action === 'upload' || item.action === 'followup'),
  false
)

const done = withSetupTodos(null, {
  publicReady: true,
  setupNext: '',
  publisherTrust: { authStatus: 'verified', profileCompleteness: 'complete' },
})
assert.strictEqual(done, null)

const onlySetup = withSetupTodos(null, unverified)
assert.strictEqual(onlySetup.items.length, 1)
assert.strictEqual(onlySetup.headline, '1 项待你处理')

const profileStep = withSetupTodos(null, {
  authStatus: 'verified',
  setupNext: 'profile',
  publicReady: false,
})
assert.strictEqual(profileStep.items[0].action, 'storeProfile')

console.log('merchant setup todos ok')
