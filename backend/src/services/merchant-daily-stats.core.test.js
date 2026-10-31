const test = require('node:test')
const assert = require('node:assert/strict')
const { isAlbumCoreComplete } = require('./merchant-daily-stats.service')

test('相册完整率把节点状态 completed 算作已完成', () => {
  const finished = [
    { status: 'completed' },
    { status: 'completed' },
    { status: 'completed' },
    { status: 'completed' },
  ]
  assert.equal(isAlbumCoreComplete(finished), true)
  assert.equal(
    isAlbumCoreComplete([{ status: 'done' }, { status: 'pending' }, { status: 'pending' }, { status: 'pending' }]),
    false,
  )
  assert.equal(isAlbumCoreComplete([]), false)
})
