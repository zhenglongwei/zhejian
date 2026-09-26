/**
 * OSS 凭证缓存与签名 URL 有效期裁剪（防 InvalidAccessKeyId 403）
 * 运行：node src/lib/oss-client.test.js
 */
const assert = require('assert')
const {
  parseCredExpiryMs,
  clampUrlExpiresSec,
  isCachedCredUsable,
} = require('./oss-client')

function testParseExpiryIso() {
  const ms = parseCredExpiryMs({ expiration: '2026-09-26T02:11:41Z' })
  assert.strictEqual(ms, Date.parse('2026-09-26T02:11:41Z'))
}

function testParseExpirySeconds() {
  const sec = 1790388701
  assert.strictEqual(parseCredExpiryMs({ expiration: sec }), sec * 1000)
}

function testParseExpiryMillis() {
  const ms = 1790388701000
  assert.strictEqual(parseCredExpiryMs({ expiration: ms }), ms)
}

function testParseExpiryMissing() {
  assert.strictEqual(parseCredExpiryMs({}), 0)
  assert.strictEqual(parseCredExpiryMs({ expiration: 'not-a-date' }), 0)
}

function testLongTermCredKeepsDesiredTtl() {
  // 长期 AK：无过期时间 → 保持配置值 7200
  const expires = clampUrlExpiresSec(7200, { expiryMs: 0 })
  assert.strictEqual(expires, 7200)
}

function testPlentyRemainingKeepsDesiredTtl() {
  const creds = { expiryMs: Date.now() + 3 * 60 * 60 * 1000 }
  assert.strictEqual(clampUrlExpiresSec(7200, creds), 7200)
}

function testShortRemainingIsCapped() {
  // 凭证只剩 30 分钟，期望 2 小时 → 裁到 30min - 60s（允许 1s 误差）
  const creds = { expiryMs: Date.now() + 30 * 60 * 1000 }
  const expires = clampUrlExpiresSec(7200, creds)
  assert.ok(expires <= 30 * 60 - 60 && expires >= 30 * 60 - 61, `expires=${expires}`)
}

function testAlmostExpiredKeepsFloor() {
  // 凭证只剩 10 秒，不能算出负数
  const creds = { expiryMs: Date.now() + 10 * 1000 }
  assert.strictEqual(clampUrlExpiresSec(7200, creds), 60)
}

function testCachedCredUsable() {
  const now = Date.now()
  const longTerm = { accessKeyId: 'LTAIxxx', accessKeySecret: 's', fetchedAt: now, expiryMs: 0 }
  // 长期凭证：5 分钟缓存内可用
  assert.strictEqual(isCachedCredUsable(now, longTerm), true)
  // 缓存超过 5 分钟也要重新取
  assert.strictEqual(isCachedCredUsable(now + 10 * 60 * 1000, longTerm), false)
  // 还没取到凭证
  assert.strictEqual(
    isCachedCredUsable(now, { accessKeyId: '', accessKeySecret: '', fetchedAt: now, expiryMs: 0 }),
    false,
  )
}

function testNearExpiryCredNotUsable() {
  const now = Date.now()
  // STS 只剩 1 分钟：缓存不可用，必须刷新
  const creds = { accessKeyId: 'STS.xxx', accessKeySecret: 's', fetchedAt: now, expiryMs: now + 60 * 1000 }
  assert.strictEqual(isCachedCredUsable(now, creds), false)
  assert.strictEqual(clampUrlExpiresSec(7200, creds), 60)
  // STS 还剩 1 小时：可用，且裁剪后应短于凭证剩余时间（允许 1s 误差）
  const fresh = { ...creds, expiryMs: now + 60 * 60 * 1000 }
  assert.strictEqual(isCachedCredUsable(now, fresh), true)
  const capped = clampUrlExpiresSec(7200, fresh)
  assert.ok(capped <= 60 * 60 - 60 && capped >= 60 * 60 - 61, `capped=${capped}`)
}

testParseExpiryIso()
testParseExpirySeconds()
testParseExpiryMillis()
testParseExpiryMissing()
testLongTermCredKeepsDesiredTtl()
testPlentyRemainingKeepsDesiredTtl()
testShortRemainingIsCapped()
testAlmostExpiredKeepsFloor()
testCachedCredUsable()
testNearExpiryCredNotUsable()
console.log('oss-client.test.js OK')
