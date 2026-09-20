const assert = require('assert')
const { toShelfStatus } = require('./h5-site-entry-status')
const { resolveMiniprogramCodeTarget } = require('./h5-miniprogram-code-target')

assert.deepStrictEqual(toShelfStatus(0), { hasPublicCases: false, total: 0 })
assert.deepStrictEqual(toShelfStatus(7), { hasPublicCases: true, total: 7 })
assert.deepStrictEqual(toShelfStatus(null), { hasPublicCases: false, total: 0 })

assert.deepStrictEqual(resolveMiniprogramCodeTarget(), {
  page: 'packageMerchant/pages/workbench/index',
  scene: 'e=wb',
})
assert.deepStrictEqual(resolveMiniprogramCodeTarget('owner'), {
  page: 'pages/mine/index',
  scene: 'e=ow',
})
assert.deepStrictEqual(resolveMiniprogramCodeTarget('wechat-archive'), {
  page: 'packageMerchant/pages/tools/wechat-archive/index',
  scene: 'e=wa',
})
try {
  resolveMiniprogramCodeTarget('unknown-entry')
  assert.fail('unknown entry should throw')
} catch (err) {
  assert.equal(err.status, 400)
}

console.log('[h5-site-entry.service.test] ok')
