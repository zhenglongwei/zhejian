const assert = require('assert')
const {
  normalizeArchiveCopy,
  mergeArchiveCopyIntoPackage,
  readArchiveCopyFromAlbum,
} = require('./album-archive-copy')
const { scrubPiiText, scrubPiiDeep } = require('./scrub-pii-text')

assert.ok(
  scrubPiiText('联系我13812345678看车').includes('[手机号已隐藏]'),
  'scrub phone',
)
assert.ok(scrubPiiText('车牌沪A12345已到店').includes('[车牌已隐藏]'), 'scrub plate')
assert.equal(
  scrubPiiDeep({ note: 'VIN:LFV2A21K8G3123456', url: 'https://x/a.jpg' }).note.includes(
    '[VIN已隐藏]',
  ),
  true,
)
assert.equal(scrubPiiDeep({ url: 'https://x/a.jpg' }).url, 'https://x/a.jpg', 'skip url')

const copy = normalizeArchiveCopy({
  summary: '大众高尔夫过减速带异响，更换右前小吊杆后路试正常。',
  faq: [{ q: '这例换了什么？', a: '这例公开档案里，更换了右前小吊杆并做了路试。' }],
})
assert.ok(copy && copy.summary)
assert.equal(copy.faq.length, 1)

const pkg = mergeArchiveCopyIntoPackage({ flowNodes: [] }, copy)
assert.ok(pkg.archiveCopy && pkg.archiveCopy.summary)

assert.ok(
  readArchiveCopyFromAlbum({ contentPackageJson: pkg }),
  'read back archiveCopy',
)

assert.equal(
  normalizeArchiveCopy({ summary: '', faq: [] }),
  null,
  'empty copy rejected',
)

console.log('album-archive-copy.test.js OK')
