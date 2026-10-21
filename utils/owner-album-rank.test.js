const test = require('node:test')
const assert = require('node:assert/strict')
const { compareOwnerAlbums, filterOwnerHubAlbums } = require('./owner-album-rank')

test('报价待确认排最前，其它待确认其次，评价再次，其余按节点时间', () => {
  const rows = [
    { id: 'inspect', progressLabel: '进行中', latestDocTitle: '检测报告', hasUnreadUpdate: true, nodeUpdatedAt: '2026-10-17T00:00:00.000Z' },
    { id: 'old', progressLabel: '施工中', updatedAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-10-20T00:00:00.000Z' },
    { id: 'review', progressLabel: '已完工', pendingOwnerReview: true, nodeUpdatedAt: '2026-10-18T00:00:00.000Z' },
    { id: 'delivery', progressLabel: '待确认完工', pendingConfirmKind: 'repair_report', pendingConfirmCount: 1, nodeUpdatedAt: '2026-10-19T00:00:00.000Z' },
    { id: 'quote-old', progressLabel: '待确认方案', pendingConfirmKind: 'quote_confirm', pendingConfirmCount: 1, nodeUpdatedAt: '2026-10-10T00:00:00.000Z' },
    { id: 'quote-new', progressLabel: '待确认方案', pendingConfirmKind: 'quote_confirm', pendingConfirmCount: 1, nodeUpdatedAt: '2026-10-20T00:00:00.000Z' },
    { id: 'idle-new', progressLabel: '施工中', nodeUpdatedAt: '2026-10-21T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' },
  ]
  const ids = rows.slice().sort(compareOwnerAlbums).map((item) => item.id)
  assert.deepEqual(ids, ['quote-new', 'quote-old', 'delivery', 'inspect', 'review', 'idle-new', 'old'])
})

test('首页筛选项按进度文案分', () => {
  const rows = [
    { id: 'a', progressLine: '施工中' },
    { id: 'b', progressLine: '待确认方案', pendingConfirmCount: 1 },
    { id: 'c', progressLine: '已完工', pendingOwnerReview: true },
  ]
  assert.deepEqual(filterOwnerHubAlbums(rows, 'active').map((item) => item.id), ['a', 'b'])
  assert.deepEqual(filterOwnerHubAlbums(rows, 'confirm').map((item) => item.id), ['b'])
  assert.deepEqual(filterOwnerHubAlbums(rows, 'review').map((item) => item.id), ['c'])
})
