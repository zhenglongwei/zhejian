const test = require('node:test')
const assert = require('node:assert/strict')
const { SERVICE_ALBUM_REPAIR_DONE_STATUSES } = require('../constants/service-album-status')
const { SERVICE_ALBUM_REPAIR_DONE_STATUSES: BACKEND_DONE } = require('../backend/src/constants/v2')

test('未交车可删，已交车不可删，两端状态一致', () => {
  const front = [...SERVICE_ALBUM_REPAIR_DONE_STATUSES].sort()
  const back = [...BACKEND_DONE].sort()
  assert.deepEqual(front, back)
  assert.equal(front.includes('in_progress'), false)
  assert.equal(front.includes('draft'), false)
  assert.equal(front.includes('completed'), true)
  assert.equal(front.includes('published'), true)
})
