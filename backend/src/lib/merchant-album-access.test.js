/**
 * merchant-album-access 单元测试
 * 运行：node src/lib/merchant-album-access.test.js
 */
const assert = require('assert')
const {
  canAccessMerchantAlbum,
  assertMerchantAlbum,
} = require('./merchant-album-access')

const album = { id: 'alb_1', merchantId: 'mch_a', storeId: 'store_b' }

assert.strictEqual(canAccessMerchantAlbum(album, 'mch_a'), true)
assert.strictEqual(canAccessMerchantAlbum(album, 'mch_b'), false)
assert.strictEqual(canAccessMerchantAlbum(album, ''), false)

let threw = false
try {
  assertMerchantAlbum(album, 'store_b', 'mch_b')
} catch (e) {
  threw = true
  assert.strictEqual(e.status, 404)
}
assert.strictEqual(threw, true, '跨商家 storeId 不应放行')

assertMerchantAlbum(album, 'store_b', 'mch_a')

console.log('merchant-album-access.test.js OK')
