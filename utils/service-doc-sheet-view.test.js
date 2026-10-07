const test = require('node:test')
const assert = require('node:assert/strict')
const {
  findingResultBucket,
  buildFindingGroups,
  buildQuoteLinesView,
  stripTotalPrefix,
  formatLineAmount,
} = require('./service-doc-sheet-view')

test('owner findings group attention first', () => {
  const groups = buildFindingGroups(
    [
      { partName: '雨刮', result: '状态良好', advice: '完好', url: 'https://a.jpg' },
      {
        partName: '侧裙',
        result: '需处理',
        advice: '漆面破损需更换',
        images: [{ url: 'https://b.jpg' }, { url: 'https://c.jpg' }],
      },
      { partName: '原理图', result: '已留证', url: 'https://d.jpg' },
    ],
    { groupByResult: true },
  )
  assert.deepEqual(
    groups.map((row) => row.title),
    ['需要留意', '状态正常', '已留证'],
  )
  assert.equal(groups[0].items[0].partName, '侧裙')
  assert.equal(groups[0].items[0].images.length, 2)
  assert.equal(groups[0].items[0].resultVariant, 'danger')
})

test('merchant preview keeps original order without group titles', () => {
  const groups = buildFindingGroups(
    [
      { partName: '雨刮', result: '状态良好' },
      { partName: '侧裙', result: '需处理' },
    ],
    { groupByResult: false },
  )
  assert.equal(groups.length, 1)
  assert.equal(groups[0].title, '')
  assert.deepEqual(
    groups[0].items.map((row) => row.partName),
    ['雨刮', '侧裙'],
  )
})

test('bucket maps 仅记录 to record', () => {
  assert.equal(findingResultBucket('仅记录'), 'record')
  assert.equal(findingResultBucket('已留证'), 'record')
  assert.equal(findingResultBucket('需关注'), 'attention')
})

test('quote amount and total labels', () => {
  const lines = buildQuoteLinesView([
    { name: '拆检', amount: 0, note: '短' },
    { name: '补漆', amount: 200, note: '拆除受损侧裙，对安装位进行除锈及防锈处理，安装全新原厂规格侧裙总成，并进行原子灰找平打磨。' },
  ])
  assert.equal(lines[0].amountText, '¥0.00')
  assert.equal(lines[1].noteCollapsible, true)
  assert.equal(stripTotalPrefix('合计 ¥550.00'), '¥550.00')
  assert.equal(formatLineAmount('¥150'), '¥150')
})
