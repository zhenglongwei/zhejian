const assert = require('assert')
const { withSetupTodos, buildMerchantTodoSummary } = require('./merchant-hub')

const unverified = {
  authStatus: 'none',
  profileCompleteness: 'basic',
}
const merged = withSetupTodos(
  buildMerchantTodoSummary({
    pendingUpload: 2,
    pendingFollowUp: 3,
    pendingReviews: 1,
  }),
  unverified
)
assert.strictEqual(merged.items.length, 3)
assert.strictEqual(merged.items[0].action, 'reviews')
assert.strictEqual(merged.items[1].action, 'auth')
assert.strictEqual(merged.items[1].label, '补认证：上传执照与法人证')
assert.strictEqual(merged.items[2].action, 'storeProfile')
assert.strictEqual(merged.headline, '3 项待你处理')
assert.strictEqual(
  merged.items.some((item) => item.action === 'upload' || item.action === 'followup'),
  false
)

const done = withSetupTodos(null, {
  publisherTrust: { authStatus: 'verified', profileCompleteness: 'complete' },
})
assert.strictEqual(done, null)

const onlySetup = withSetupTodos(null, unverified)
assert.strictEqual(onlySetup.items.length, 2)
assert.strictEqual(onlySetup.headline, '2 项待你处理')

console.log('merchant setup todos ok')
