const test = require('node:test')
const assert = require('node:assert/strict')
const {
  isStageFrozen,
  canEnterStage,
  canOpenStage,
  isNodeEditFrozen,
  stageSeal,
} = require('./flow-stage-locks')

function node(partial) {
  return { sortOrder: 0, status: 'pending', ...partial }
}

test('接车发出后接车冻，检测未发出时可进检测但不能改接车', () => {
  const nodes = [
    node({
      id: 'i1',
      kind: 'intake',
      sortOrder: 0,
      status: 'completed',
      document: { status: 'delivered' },
    }),
    node({ id: 'p2', kind: 'inspection', sortOrder: 1, status: 'in_progress' }),
    node({ id: 'r2', kind: 'inspection_report', sortOrder: 2, status: 'in_progress', document: { status: 'draft' } }),
  ]
  assert.equal(stageSeal(nodes, 'intake'), true)
  assert.equal(isStageFrozen(nodes, 'intake'), true)
  assert.equal(isStageFrozen(nodes, 'inspect'), false)
  assert.equal(canEnterStage(nodes, 'inspect'), true)
  assert.equal(canOpenStage(nodes, 'intake'), true)
  assert.equal(isNodeEditFrozen(nodes, nodes[0]), true)
  assert.equal(isNodeEditFrozen(nodes, nodes[1]), false)
})

test('检测报告发出后检测与接车冻，可进报价草稿', () => {
  const nodes = [
    node({
      id: 'i1',
      kind: 'intake',
      sortOrder: 0,
      status: 'completed',
      document: { status: 'delivered' },
    }),
    node({ id: 'p2', kind: 'inspection', sortOrder: 1, status: 'completed' }),
    node({
      id: 'r2',
      kind: 'inspection_report',
      sortOrder: 2,
      status: 'completed',
      document: { status: 'delivered' },
    }),
    node({
      id: 'q1',
      kind: 'quote_confirm',
      sortOrder: 3,
      status: 'in_progress',
      document: { status: 'draft' },
    }),
  ]
  assert.equal(isStageFrozen(nodes, 'intake'), true)
  assert.equal(isStageFrozen(nodes, 'inspect'), true)
  assert.equal(isStageFrozen(nodes, 'quote'), false)
  assert.equal(canEnterStage(nodes, 'quote'), true)
  assert.equal(canOpenStage(nodes, 'work'), false)
})

test('报价待确认即冻报价，须确认后才能进施工', () => {
  const nodes = [
    node({
      id: 'i1',
      kind: 'intake',
      sortOrder: 0,
      status: 'completed',
      document: { status: 'delivered' },
    }),
    node({
      id: 'r2',
      kind: 'inspection_report',
      sortOrder: 1,
      status: 'completed',
      document: { status: 'delivered' },
    }),
    node({
      id: 'q1',
      kind: 'quote_confirm',
      sortOrder: 2,
      status: 'in_progress',
      document: { status: 'pending_confirm' },
    }),
    node({ id: 'w1', kind: 'work', sortOrder: 3, status: 'locked' }),
  ]
  assert.equal(isStageFrozen(nodes, 'quote'), true)
  assert.equal(isStageFrozen(nodes, 'work'), false)
  assert.equal(canEnterStage(nodes, 'work'), false)
})

test('报价确认后可施工；交车发出后施工冻', () => {
  const base = [
    node({
      id: 'i1',
      kind: 'intake',
      sortOrder: 0,
      status: 'completed',
      document: { status: 'delivered' },
    }),
    node({
      id: 'r2',
      kind: 'inspection_report',
      sortOrder: 1,
      status: 'completed',
      document: { status: 'delivered' },
    }),
    node({
      id: 'q1',
      kind: 'quote_confirm',
      sortOrder: 2,
      status: 'completed',
      document: { status: 'confirmed' },
    }),
    node({ id: 'w1', kind: 'work', sortOrder: 3, status: 'completed' }),
    node({ id: 'd1', kind: 'delivery_photos', sortOrder: 4, status: 'in_progress' }),
    node({
      id: 'rr',
      kind: 'repair_report',
      sortOrder: 5,
      status: 'in_progress',
      document: { status: 'draft' },
    }),
  ]
  assert.equal(canEnterStage(base, 'work'), true)
  assert.equal(isStageFrozen(base, 'work'), false)
  assert.equal(canOpenStage(base, 'finish'), true)

  const sent = base.map((row) =>
    row.kind === 'repair_report'
      ? { ...row, document: { status: 'pending_confirm' } }
      : row,
  )
  assert.equal(isStageFrozen(sent, 'work'), true)
  assert.equal(isStageFrozen(sent, 'finish'), true)
  assert.equal(isNodeEditFrozen(sent, sent.find((row) => row.kind === 'work')), true)
})

test('补充报价发出后该张单冻', () => {
  const addon = node({
    id: 'qa',
    kind: 'quote_confirm',
    insertedReason: 'addon',
    sortOrder: 4,
    document: { status: 'pending_confirm' },
  })
  assert.equal(isNodeEditFrozen([], addon), true)
  const draft = { ...addon, document: { status: 'draft' } }
  assert.equal(isNodeEditFrozen([], draft), false)
})
