const test = require('node:test')
const assert = require('node:assert/strict')
const { presentMerchantTimeline, merchantDocTitle } = require('./merchant-flow-steps')

function step(id, kind, extra = {}) {
  return { id, kind, title: kind, detailKind: 'photos', ...extra }
}

test('检测报告还在写时，检测不单独算完成', () => {
  const view = presentMerchantTimeline(
    [step('a', 'intake'), step('b', 'inspection')],
    { id: 'c', kind: 'inspection_report' },
  )
  assert.deepEqual(
    view.completed.map((row) => row.title),
    ['第1步 · 接车'],
  )
  assert.equal(view.activeTitle, '第2步 · 检测')
})

test('报告写完后，检测收成一步，当前是报价', () => {
  const view = presentMerchantTimeline(
    [
      step('a', 'intake'),
      step('b', 'inspection'),
      step('c', 'inspection_report', { detailKind: 'doc_sheet' }),
    ],
    { id: 'd', kind: 'quote_confirm' },
  )
  assert.deepEqual(
    view.completed.map((row) => row.title),
    ['第1步 · 接车', '第2步 · 检测'],
  )
  assert.equal(view.completed[1].detailKind, 'doc_sheet')
  assert.equal(view.activeTitle, '第3步 · 报价')
})

test('交车照片和交车报告同属完工', () => {
  const view = presentMerchantTimeline(
    [
      step('a', 'intake'),
      step('b', 'inspection'),
      step('c', 'inspection_report'),
      step('d', 'quote_confirm'),
      step('e', 'work'),
      step('f', 'delivery_photos'),
    ],
    { id: 'g', kind: 'repair_report' },
  )
  assert.equal(view.completed.length, 4)
  assert.equal(view.completed[3].title, '第4步 · 施工')
  assert.equal(view.activeTitle, '第5步 · 完工')
})

test('补充报价不并进第一次报价', () => {
  const view = presentMerchantTimeline(
    [
      step('a', 'intake'),
      step('b', 'inspection'),
      step('c', 'inspection_report'),
      step('d', 'quote_confirm'),
      step('e', 'work'),
      step('f', 'quote_confirm'),
    ],
    { id: 'g', kind: 'work' },
  )
  assert.deepEqual(
    view.completed.map((row) => row.title),
    ['第1步 · 接车', '第2步 · 检测', '第3步 · 报价', '第4步 · 施工', '第5步 · 报价'],
  )
  assert.equal(view.activeTitle, '第6步 · 施工')
})

test('单据对外名称', () => {
  assert.equal(merchantDocTitle('quote_confirm'), '报价单')
  assert.equal(merchantDocTitle('work'), '维修工单')
  assert.equal(merchantDocTitle('repair_report'), '交车报告')
  assert.equal(merchantDocTitle('inspection_report'), '检测报告')
})
