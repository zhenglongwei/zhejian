const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeWorkFinding,
  mapWorkFindingRows,
} = require('./service-flow-docs')

test('explicit empty images[] is not restored from leftover url', () => {
  const row = normalizeWorkFinding({
    partName: '右前门',
    url: 'https://example.com/old.jpg',
    imageId: 'old',
    images: [],
  })
  assert.equal(row.images.length, 0)
  assert.equal(row.url, '')
  assert.equal(row.partName, '右前门')
})

test('legacy work row without images field still uses url', () => {
  const row = normalizeWorkFinding({
    partName: '右前门',
    url: 'https://example.com/old.jpg',
  })
  assert.equal(row.images.length, 1)
  assert.equal(row.images[0].url, 'https://example.com/old.jpg')
})

test('keeps multiple images on one work finding', () => {
  const row = normalizeWorkFinding({
    partName: '右前门',
    images: [{ url: 'https://a.jpg' }, { url: 'https://b.jpg' }],
  })
  assert.equal(row.images.length, 2)
  assert.equal(row.url, 'https://a.jpg')
})

test('mapWorkFindingRows keeps multi-image draft and remaps persisted urls in order', () => {
  const draft = [
    {
      partName: '右前门',
      caption: '补漆',
      images: [{ url: 'tmp://1' }, { url: 'tmp://2' }],
    },
  ]
  const persisted = [
    { url: 'https://cdn/1.jpg', id: 'id1' },
    { url: 'https://cdn/2.jpg', id: 'id2' },
  ]
  const rows = mapWorkFindingRows(persisted, draft)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].images.length, 2)
  assert.equal(rows[0].images[0].url, 'https://cdn/1.jpg')
  assert.equal(rows[0].images[1].url, 'https://cdn/2.jpg')
  assert.equal(rows[0].partName, '右前门')
})
