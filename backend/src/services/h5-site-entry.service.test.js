const assert = require('assert')
const { toShelfStatus } = require('./h5-site-entry-status')

assert.deepStrictEqual(toShelfStatus(0), { hasPublicCases: false, total: 0 })
assert.deepStrictEqual(toShelfStatus(7), { hasPublicCases: true, total: 7 })
assert.deepStrictEqual(toShelfStatus(null), { hasPublicCases: false, total: 0 })
console.log('[h5-site-entry.service.test] ok')
