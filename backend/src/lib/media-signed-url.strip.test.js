/**
 * 运行：node src/lib/media-signed-url.strip.test.js
 */
const assert = require('assert')
const { stripMediaAccessQueryDeep, stripUrlQuery } = require('./media-signed-url')

const signed =
  'https://staging.zhejian.simplewin.cn/api/v1/media/files/uploads/2026/10/abc.jpg?exp=1&sig=dead'
const bare = stripUrlQuery(signed)

const got = stripMediaAccessQueryDeep({
  flowNodes: [
    {
      photoDraft: {
        pendingImages: [{ url: signed }],
        findings: [{ images: [signed, 'https://example.com/x.jpg'] }],
      },
    },
  ],
})

assert.strictEqual(got.flowNodes[0].photoDraft.pendingImages[0].url, bare)
assert.strictEqual(got.flowNodes[0].photoDraft.findings[0].images[0], bare)
assert.strictEqual(
  got.flowNodes[0].photoDraft.findings[0].images[1],
  'https://example.com/x.jpg',
)

console.log('media-signed-url.strip.test.js OK')
