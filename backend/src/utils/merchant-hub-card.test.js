const test = require('node:test')
const assert = require('node:assert/strict')
const { buildMerchantHubCard } = require('./merchant-hub-card')

test('施工中：报价已确认，工单进行中', () => {
  const card = buildMerchantHubCard({
    status: 'in_progress',
    vehicle: { plateDisplay: '粤B·7K52M', brand: '宝马', series: '3系', modelYear: '2021款' },
    flowNodes: [
      { id: 'n1', kind: 'intake', status: 'completed' },
      { id: 'n2', kind: 'inspection', status: 'completed' },
      { id: 'n3', kind: 'inspection_report', status: 'completed', document: { status: 'delivered' } },
      { id: 'n4', kind: 'quote_confirm', status: 'completed', document: { status: 'confirmed' } },
      { id: 'n5', kind: 'work', status: 'in_progress' },
    ],
  })
  assert.equal(card.pill, '施工中')
  assert.equal(card.plate, '粤B·7K52M')
  assert.equal(card.modelLine, '宝马 · 3系 · 2021款')
  assert.deepEqual(
    card.steps.map((step) => step.state),
    ['done', 'done', 'done', 'current', 'todo'],
  )
  assert.equal(card.quotePending, false)
  assert.ok(card.progress > 60 && card.progress < 80)
})

test('待确认只指标价，不把交车确认算进去', () => {
  const card = buildMerchantHubCard({
    status: 'in_progress',
    flowNodes: [
      { id: 'n1', kind: 'intake', status: 'completed' },
      { id: 'n2', kind: 'inspection', status: 'completed' },
      { id: 'n3', kind: 'inspection_report', status: 'completed', document: { status: 'delivered' } },
      { id: 'n4', kind: 'quote_confirm', status: 'in_progress', document: { status: 'pending_confirm' } },
    ],
  })
  assert.equal(card.pill, '待确认')
  assert.equal(card.quotePending, true)
  assert.equal(card.steps[2].state, 'current')
})

test('补充报价未确认时仍是待确认', () => {
  const card = buildMerchantHubCard({
    status: 'in_progress',
    flowNodes: [
      { id: 'n1', kind: 'quote_confirm', status: 'completed', document: { status: 'confirmed' } },
      { id: 'n2', kind: 'work', status: 'in_progress' },
      { id: 'n3', kind: 'addon_quote_confirm', status: 'in_progress', document: { status: 'pending_confirm' } },
    ],
  })
  assert.equal(card.pill, '待确认')
})

test('已完工相册是已交车，五步都完成', () => {
  const card = buildMerchantHubCard({
    status: 'completed',
    publicCaseStatus: 'public_approved',
    flowNodes: [],
  })
  assert.equal(card.pill, '已交车')
  assert.equal(card.repairDone, true)
  assert.equal(card.publicOnSite, true)
  assert.equal(card.progress, 100)
  assert.ok(card.steps.every((step) => step.state === 'done'))
})

test('没有流程记录的进行中相册停在接车', () => {
  const card = buildMerchantHubCard({ status: 'in_progress', flowNodes: [] })
  assert.equal(card.pill, '进行中')
  assert.equal(card.steps[0].state, 'current')
  assert.equal(card.steps[1].state, 'todo')
})
