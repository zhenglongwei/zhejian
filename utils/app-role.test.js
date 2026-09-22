const assert = require('assert')
const { decideRole } = require('./app-role')

assert.strictEqual(decideRole({ local: 'owner', isMerchant: true }), 'owner')
assert.strictEqual(decideRole({ preferredRole: 'merchant' }), 'merchant')
assert.strictEqual(decideRole({ preferredRole: 'owner', isMerchant: true }), 'owner')
assert.strictEqual(decideRole({ isMerchant: true }), 'merchant')
assert.strictEqual(decideRole({ hasAlbumBindings: true }), 'owner')
assert.strictEqual(decideRole({ isMerchant: true, hasAlbumBindings: true }), 'merchant')
assert.strictEqual(decideRole({}), '')
assert.strictEqual(decideRole({ local: 'staff' }), '')

console.log('app-role decideRole ok')
