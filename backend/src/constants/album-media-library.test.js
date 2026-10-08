const test = require('node:test')
const assert = require('node:assert/strict')
const {
  LIBRARY_NODE_ID,
  isLibraryNodeId,
  excludeLibraryNodes,
  listDetachedImageIds,
} = require('./album-media-library')

test('excludeLibraryNodes drops the library stage', () => {
  const nodes = excludeLibraryNodes([
    { nodeId: 'stage_5', title: '工单' },
    { id: LIBRARY_NODE_ID, title: '图库' },
  ])
  assert.deepEqual(
    nodes.map((row) => row.nodeId || row.id),
    ['stage_5'],
  )
})

test('patch work node parks leftover photos, keeps library photos', () => {
  const ids = listDetachedImageIds(
    [
      { id: 'keep', nodeId: 'stage_5' },
      { id: 'drop', nodeId: 'stage_5' },
      { id: 'lib', nodeId: LIBRARY_NODE_ID },
    ],
    ['keep'],
    { patchedNodeIds: ['stage_5'] },
  )
  assert.deepEqual(ids, ['drop'])
})

test('empty findings parks every photo on the patched node', () => {
  const ids = listDetachedImageIds(
    [
      { id: 'a', nodeId: 'stage_5' },
      { id: 'b', nodeId: 'stage_2' },
    ],
    [],
    { patchedNodeIds: ['stage_5'] },
  )
  assert.deepEqual(ids, ['a'])
})

test('replaceAll parks photos that are not in the new list, not library rows', () => {
  const ids = listDetachedImageIds(
    [
      { id: 'old', nodeId: 'stage_1' },
      { id: 'lib', nodeId: LIBRARY_NODE_ID },
      { id: 'keep', nodeId: 'stage_2' },
    ],
    ['keep'],
    { replaceAll: true },
  )
  assert.deepEqual(ids, ['old'])
})

test('isLibraryNodeId', () => {
  assert.equal(isLibraryNodeId('library'), true)
  assert.equal(isLibraryNodeId('stage_5'), false)
})
