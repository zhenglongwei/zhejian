const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeGroups } = require('./node-photo-organize.service')

test('normalizeGroups only keeps keys that exist in pending photos', () => {
  const pending = [
    { url: 'https://cdn.example/api/v1/media/files/uploads/a.jpg' },
    { url: 'https://cdn.example/api/v1/media/files/uploads/b.jpg' },
  ]
  const groups = normalizeGroups(
    [
      { partName: '液压位', imageKeys: ['uploads/a.jpg', 'uploads/missing.jpg'] },
      { partName: '', imageKeys: [] },
    ],
    pending,
  )
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].imageKeys, ['a.jpg'])
})
