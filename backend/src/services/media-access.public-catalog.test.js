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

// 接待区 / 品牌授权：与门头同属 photos_json，签名过期后须能靠目录匹配放行
const receptionKey = 'uploads/2026/07/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'
const brandAuthKey = 'uploads/2026/07/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png'
assert.strictEqual(
  mediaUrlMatchesObjectKey(
    `https://staging.geo.simplewin.cn/api/v1/media/files/${receptionKey}?exp=1&sig=dead`,
    receptionKey
  ),
  true
)
assert.strictEqual(
  mediaUrlMatchesObjectKey(`/api/v1/media/files/${brandAuthKey}`, brandAuthKey),
  true
)

console.log('media-access.public-catalog.test.js OK')
