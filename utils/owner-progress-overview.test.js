const test = require('node:test')
const assert = require('node:assert/strict')
const { buildOwnerProgressBoard } = require('./owner-progress-overview')
const { filterUserAlbumsByTab } = require('./service-album-tab-filter')

test('待确认报价排成横排文书，工单摘要不带金额', () => {
  const board = buildOwnerProgressBoard(
    {
      vehicle: { plate: '粤B7K52M', brand: '宝马', series: '3系', mileage: 68420 },
      storeName: '驰援汽车',
      ownerFlow: { progressLabel: '待确认方案' },
    },
    [
      { id: 'in', kind: 'intake', title: '接车报告', locked: false, stepState: 'done', statusLabel: '已发给车主', chiefComplaint: '地面有油迹' },
      { id: 're', kind: 'inspection_report', title: '检测报告', locked: false, stepState: 'done', statusLabel: '可查看', findings: [{ partName: '气门室盖' }] },
      {
        id: 'q',
        kind: 'quote_confirm',
        title: '报价单',
        locked: false,
        needsConfirm: true,
        stepState: 'current',
        statusLabel: '待确认',
        totalAmount: 2860,
        confirmCopy: '本人同意按上述项目施工，费用以本单为准。',
      },
      {
        id: 'w',
        kind: 'work',
        title: '维修工单',
        locked: false,
        stepState: 'done',
        statusLabel: '施工记录',
        items: [{ name: '更换气门室盖垫', amount: 1680 }],
      },
      { id: 'd', kind: 'repair_report', title: '交车报告', locked: true, statusLabel: '待进行' },
    ],
  )

  assert.equal(board.plate, '粤B·7K52M')
  assert.equal(board.vehicleName, '宝马 3系')
  assert.equal(board.meta, '驰援汽车')
  assert.equal(board.pill.text, '待确认方案')
  assert.equal(board.pill.tone, 'amber')
  assert.equal(board.tiles[2].tone, 'live')
  assert.equal(board.tiles[3].tone, 'ok')
  assert.equal(board.tiles[4].locked, true)
  assert.equal(board.rows[0].detail, '地面有油迹')
  assert.equal(board.rows[2].detail, '¥2,860 · 待你确认')
  assert.equal(board.rows[3].detail, '更换气门室盖垫')
  assert.equal(board.rows[3].detail.includes('1680'), false)
  assert.equal(board.rows[4].detail, '还没到这一步')
  assert.equal(board.protocol, '本人同意按上述项目施工，费用以本单为准。')
  assert.equal(board.pendingId, 'q')
  assert.equal(JSON.stringify(board).includes('健康分'), false)
})

test('待确认筛出等车主点确认的相册', () => {
  const albums = [
    { id: 'a', status: 'in_progress', progressLabel: '施工中' },
    { id: 'b', status: 'in_progress', pendingConfirmCount: 1 },
    {
      id: 'c',
      status: 'completed',
      contentPackageJson: { flowNodes: [{ document: { status: 'pending_confirm' } }] },
    },
  ]
  const ids = filterUserAlbumsByTab(albums, 'confirm').map((item) => item.id)
  assert.deepEqual(ids, ['b', 'c'])
  assert.deepEqual(
    filterUserAlbumsByTab(albums, 'active').map((item) => item.id),
    ['a', 'b'],
  )
})
