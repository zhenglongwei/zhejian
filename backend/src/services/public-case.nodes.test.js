const test = require('node:test')
const assert = require('node:assert/strict')
const { buildNodesFromTask } = require('./public-case.service')

test('buildNodesFromTask maps assets by nodeId and dedupes images', () => {
  const nodes = [
    { id: 'stage_1', title: '接车记录', images: ['raw-a', 'raw-a'] },
    { id: 'stage_2', title: '损伤检查', images: ['raw-b'] },
  ]
  const task = {
    assets: [
      { nodeId: 'stage_1', idx: 0, maskedUrl: '/media/files/uploads/desensitized/a.jpg' },
      { nodeId: 'stage_1', idx: 0, maskedUrl: '/media/files/uploads/desensitized/a.jpg' },
      { nodeId: 'stage_2', idx: 0, maskedUrl: '/media/files/uploads/desensitized/b.jpg' },
    ],
  }

  const result = buildNodesFromTask(nodes, task)
  assert.equal(result[0].title, '接车记录')
  assert.deepEqual(result[0].images, ['/media/files/uploads/desensitized/a.jpg'])
  assert.equal(result[1].title, '损伤检查')
  assert.deepEqual(result[1].images, ['/media/files/uploads/desensitized/b.jpg'])
})

test('buildNodesFromTask clears images when task has no assets', () => {
  const nodes = [{ id: 'stage_1', title: '接车记录', images: ['raw-a'] }]
  const result = buildNodesFromTask(nodes, { assets: [] })
  assert.deepEqual(result[0].images, [])
})
