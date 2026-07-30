/**
 * 配件凭证 partsJson 原图匹配
 * 运行：node src/services/media-access.parts.test.js
 */
const assert = require('assert')
const { albumPartsReferenceObjectKey } = require('./media-access.service')

const objectKey = 'uploads/2026/07/6ca77d0e6ad7f1bf5749fa3d5f423d12.webp'
const signedUrl =
  `https://staging.geo.simplewin.cn/api/v1/media/files/${objectKey}?exp=1&sig=dead`

assert.strictEqual(
  albumPartsReferenceObjectKey(
    [{ name: '保险杠', photos: [signedUrl] }],
    objectKey
  ),
  true
)
assert.strictEqual(
  albumPartsReferenceObjectKey(
    [{ name: '底盘', thumbUrl: signedUrl, photos: [] }],
    objectKey
  ),
  true
)
assert.strictEqual(
  albumPartsReferenceObjectKey(
    [{ name: '其他', imageUrl: `/api/v1/media/files/${objectKey}` }],
    objectKey
  ),
  true
)
assert.strictEqual(
  albumPartsReferenceObjectKey(
    [{ name: '无关', photos: ['https://example.com/other.webp'] }],
    objectKey
  ),
  false
)
assert.strictEqual(albumPartsReferenceObjectKey([], objectKey), false)
assert.strictEqual(albumPartsReferenceObjectKey(null, objectKey), false)

console.log('media-access.parts.test.js OK')
