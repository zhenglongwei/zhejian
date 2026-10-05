const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeGroups } = require('./node-photo-organize.service')

test('normalizeGroups maps 图1 slots to pending photos', () => {
  const pending = [
    { url: 'https://cdn.example/api/v1/media/files/uploads/a.jpg' },
    { url: 'https://cdn.example/api/v1/media/files/uploads/b.jpg' },
  ]
  const groups = normalizeGroups(
    [{ partName: '雨刮器', imageSlots: ['图2', 1] }],
    pending,
  )
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].imageKeys, ['b.jpg', 'a.jpg'])
})

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

test('groupsFromFindingCache rebuilds inspection groups without re-vision', () => {
  const { groupsFromFindingCache } = require('./node-photo-organize.service')
  const pending = [{ url: 'https://cdn.example/api/v1/media/files/uploads/a.jpg' }]
  const groups = groupsFromFindingCache(
    [{
      imageKey: 'a.jpg',
      resultJson: {
        imageKey: 'a.jpg',
        partName: '右前门',
        result: '需处理',
        observation: '漆面凹陷约 8cm',
        advice: '右前门近景可见凹陷',
      },
    }],
    pending,
  )
  assert.equal(groups.length, 1)
  assert.equal(groups[0].partName, '右前门')
  assert.equal(groups[0].observation, '漆面凹陷约 8cm')
  assert.deepEqual(groups[0].imageKeys, ['a.jpg'])
})

test('mergeGroupsByPart merges same part from cache and fresh', () => {
  const { mergeGroupsByPart } = require('./node-photo-organize.service')
  const pending = [
    { url: 'https://cdn.example/api/v1/media/files/uploads/a.jpg' },
    { url: 'https://cdn.example/api/v1/media/files/uploads/b.jpg' },
  ]
  const groups = mergeGroupsByPart(
    [
      { partName: '右前门', imageKeys: ['a.jpg'], observation: '凹陷' },
      { partName: '右前门', imageKeys: ['b.jpg'], advice: '近景可见凹陷' },
    ],
    pending,
  )
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].imageKeys.sort(), ['a.jpg', 'b.jpg'].sort())
  assert.equal(groups[0].observation, '凹陷')
  assert.equal(groups[0].advice, '近景可见凹陷')
})

test('classifyReviewVisionRows skips organized images and keeps item uploads', () => {
  const { classifyReviewVisionRows } = require('./node-photo-organize.service')
  const split = classifyReviewVisionRows(
    [
      { url: 'https://masked/a.jpg', label: '发现项0 右前门', rawUrl: 'https://cdn.example/api/v1/media/files/uploads/a.jpg' },
      { url: 'https://masked/b.jpg', label: '发现项0 右前门', rawUrl: 'https://cdn.example/api/v1/media/files/uploads/b.jpg' },
    ],
    {
      'a.jpg': { id: 'img-a' },
      'b.jpg': { id: 'img-b' },
    },
    {
      'img-a': { resultJson: { partName: '右前门', observation: '凹陷约 8cm' } },
    },
  )
  assert.equal(split.cachedFacts.length, 1)
  assert.equal(split.cachedFacts[0].observation, '凹陷约 8cm')
  assert.equal(split.visionUrls.length, 1)
  assert.equal(split.visionUrls[0].rawUrl.includes('b.jpg'), true)
})
