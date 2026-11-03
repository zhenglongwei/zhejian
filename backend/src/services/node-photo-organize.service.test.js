const test = require('node:test')
const assert = require('node:assert/strict')
const { classifyReviewVisionRows } = require('./node-photo-organize.service')

test('classifyReviewVisionRows skips organized images and keeps item uploads', () => {
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
