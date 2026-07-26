const assert = require('assert')
const {
  sanitizeArchiveBaseName,
  buildArchiveFileEntries,
} = require('./album-owner-archive.service')
const { buildZipStore, crc32 } = require('../lib/zip-store')

assert.strictEqual(sanitizeArchiveBaseName('接车/记录'), '接车记录')
assert.strictEqual(sanitizeArchiveBaseName('  a:b*c  '), 'abc')

const single = buildArchiveFileEntries([
  { nodeId: 'stage_1', title: '接车记录', rawUrl: 'https://x/a.jpg', idx: 0 },
])
assert.deepStrictEqual(
  single.map((x) => x.name),
  ['接车记录.jpg'],
)

const multi = buildArchiveFileEntries([
  { nodeId: 'stage_1', title: '接车记录', rawUrl: 'https://x/a.jpg', idx: 0 },
  { nodeId: 'stage_1', title: '接车记录', rawUrl: 'https://x/b.png', idx: 1 },
  { nodeId: 'stage_4', title: '配件/材料凭证', rawUrl: 'https://x/c.webp', idx: 0 },
])
assert.deepStrictEqual(
  multi.map((x) => x.name),
  ['接车记录-1.jpg', '接车记录-2.png', '配件材料凭证.webp'],
)

const payload = Buffer.from('hello-zip')
const zip = buildZipStore([{ name: '接车记录.jpg', data: payload }])
assert.ok(zip.length > 30)
assert.strictEqual(zip.readUInt32LE(0), 0x04034b50)
assert.strictEqual(crc32(payload), crc32(Buffer.from('hello-zip')))

console.log('album-owner-archive.service.test.js OK')
