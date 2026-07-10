/**
 * media-signed-url 单元测试
 * 运行：node src/lib/media-signed-url.test.js
 */
process.env.JWT_SECRET = 'test-signing-secret-for-media-signed-url-unit-test'
process.env.MEDIA_SIGNED_URLS_ENABLED = 'true'
process.env.NODE_ENV = 'production'

delete require.cache[require.resolve('../config')]
delete require.cache[require.resolve('./media-signed-url')]
delete require.cache[require.resolve('./media-storage')]

const assert = require('assert')
const {
  isOriginalUploadObjectKey,
  verifyMediaSignature,
  buildMediaSignature,
} = require('./media-signed-url')
const { buildPublicMediaUrl, parseObjectKeyFromPublicUrl } = require('./media-storage')

const objectKey = 'uploads/2026/07/abcdef0123456789abcdef0123456789.jpg'

assert.strictEqual(isOriginalUploadObjectKey(objectKey), true)
assert.strictEqual(isOriginalUploadObjectKey('uploads/desensitized/alb/node_0.jpg'), false)

const exp = Math.floor(Date.now() / 1000) + 3600
const sig = buildMediaSignature(objectKey, exp)
assert.strictEqual(verifyMediaSignature(objectKey, exp, sig), true)
assert.strictEqual(verifyMediaSignature(objectKey, exp, 'deadbeef'), false)
assert.strictEqual(verifyMediaSignature(objectKey, exp - 7200, sig), false)

const signedUrl = buildPublicMediaUrl(objectKey)
assert.match(signedUrl, /[?&]exp=\d+/)
assert.match(signedUrl, /[?&]sig=[a-f0-9]+/)

const parsed = parseObjectKeyFromPublicUrl(signedUrl)
assert.strictEqual(parsed, objectKey)

console.log('media-signed-url.test.js OK')
