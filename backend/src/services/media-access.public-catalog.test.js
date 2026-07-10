/**
 * 公开内容目录原图读权限
 * 运行：node src/services/media-access.public-catalog.test.js
 */
const assert = require('assert')
const { mediaUrlMatchesObjectKey } = require('./media-access.service')

const objectKey = 'uploads/2026/06/5b6a227d9dbbcd7740a61f77d042b431.jpg'
const publicUrl =
  'https://geo.simplewin.cn/api/v1/media/files/uploads/2026/06/5b6a227d9dbbcd7740a61f77d042b431.jpg'

assert.strictEqual(mediaUrlMatchesObjectKey(publicUrl, objectKey), true)
assert.strictEqual(
  mediaUrlMatchesObjectKey('/api/v1/media/files/uploads/2026/06/5b6a227d9dbbcd7740a61f77d042b431.jpg', objectKey),
  true
)
assert.strictEqual(mediaUrlMatchesObjectKey('https://example.com/other.jpg', objectKey), false)

console.log('media-access.public-catalog.test.js OK')
