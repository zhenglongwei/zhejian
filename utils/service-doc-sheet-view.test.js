const test = require('node:test')
const assert = require('node:assert/strict')
const {
  ownerFindingBucket,
  buildFindingGroups,
  collectPrimaryQuoteLines,
  buildQuoteLinesView,
  stripTotalPrefix,
  formatLineAmount,
} = require('./service-doc-sheet-view')

const quoteLines = [
  { name: '车身侧裙/底大边更换并喷漆', amount: 200 },
  { name: '更换机油滤芯', amount: 150 },
  { name: '车身前部事故损伤修复', amount: 200 },
]

test('owner groups by quote, watch, then normal', () => {
  const groups = buildFindingGroups(
    [
      { partName: '雨刮', result: '状态良好', advice: '完好', url: 'https://a.jpg' },
      {
        partName: '车身侧裙/底大边',
        result: '需处理',
        advice: '漆面破损需更换',
        images: [{ url: 'https://b.jpg' }, { url: 'https://c.jpg' }],
      },
      { partName: '底盘悬挂系统', result: '需关注', url: 'https://d.jpg' },
      { partName: '机油滤芯原理图', result: '已留证', url: 'https://e.jpg' },
      { partName: '机油滤芯', result: '需处理', url: 'https://f.jpg' },
    ],
    { groupForOwner: true, quoteLines },
  )
  assert.deepEqual(
    groups.map((row) => row.title),
    ['需要处理', '建议关注', '正常'],
  )
  assert.deepEqual(
    groups[0].items.map((row) => row.partName),
    ['车身侧裙/底大边', '机油滤芯'],
  )
  assert.equal(groups[1].items[0].partName, '底盘悬挂系统')
  assert.deepEqual(
    groups[2].items.map((row) => row.partName),
    ['雨刮', '机油滤芯原理图'],
  )
})

test('record/ok never enter 需要处理 even if name overlaps quote', () => {
  assert.equal(
    ownerFindingBucket({ partName: '机油滤芯原理图', result: '已留证' }, quoteLines),
    'ok',
  )
  assert.equal(
    ownerFindingBucket({ partName: '机油滤芯', result: '状态良好' }, quoteLines),
    'ok',
  )
})

test('unmatched 需处理 stays in 需要处理 when there is no quote yet', () => {
  assert.equal(
    ownerFindingBucket({ partName: '侧裙', result: '需处理' }, []),
    'action',
  )
})

test('merchant preview keeps original order without group titles', () => {
  const groups = buildFindingGroups(
    [
      { partName: '雨刮', result: '状态良好' },
      { partName: '侧裙', result: '需处理' },
    ],
    { groupForOwner: false },
  )
  assert.equal(groups.length, 1)
  assert.equal(groups[0].title, '')
  assert.deepEqual(
    groups[0].items.map((row) => row.partName),
    ['雨刮', '侧裙'],
  )
})

test('collectPrimaryQuoteLines skips addon and cancelled', () => {
  const lines = collectPrimaryQuoteLines([
    { kind: 'inspection_report' },
    {
      kind: 'quote_confirm',
      cancelled: true,
      lines: [{ name: '旧单' }],
    },
    {
      kind: 'quote_confirm',
      isAddon: false,
      lines: [{ name: '更换机油滤芯' }],
    },
    {
      kind: 'addon_quote_confirm',
      isAddon: true,
      lines: [{ name: '增项' }],
    },
  ])
  assert.equal(lines[0].name, '更换机油滤芯')
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
