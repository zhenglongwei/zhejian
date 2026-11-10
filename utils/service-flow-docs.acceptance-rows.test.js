const test = require('node:test')
const assert = require('node:assert/strict')
const { buildAcceptanceRowsFromWorkItems } = require('./service-flow-docs')

const workItems = [{ name: '侧裙修复' }, { name: '护板螺丝复紧' }]

test('行=施工项目：逐项生成，结果留空等实查', () => {
  const rows = buildAcceptanceRowsFromWorkItems(workItems, [])
  assert.deepEqual(
    rows.map((row) => row.name),
    ['侧裙修复', '护板螺丝复紧', '外观'],
  )
  assert.equal(rows[0].kind, 'work')
  assert.equal(rows[0].result, '')
  assert.equal(rows[2].kind, 'exterior')
})

test('已填内容按行名回填，不按第几行配对', () => {
  const saved = [
    { id: 'acc_1', kind: 'work', name: '护板螺丝复紧', images: [{ url: 'a.jpg' }], result: 'pass', note: '力矩到位' },
    { id: 'exterior', kind: 'exterior', name: '外观', images: [{ url: 'out.jpg' }], result: 'pass', note: '整车干净' },
  ]
  const rows = buildAcceptanceRowsFromWorkItems(workItems, saved)
  assert.equal(rows[0].name, '侧裙修复')
  assert.equal(rows[0].result, '')
  assert.equal(rows[1].name, '护板螺丝复紧')
  assert.equal(rows[1].result, 'pass')
  assert.equal(rows[1].note, '力矩到位')
  assert.equal(rows[1].images[0].url, 'a.jpg')
  assert.equal(rows[2].images[0].url, 'out.jpg')
})

test('旧汇总行（整体验收）不再挡住逐项，也不硬塞进某一项', () => {
  const saved = [
    { id: 'acc_1', kind: 'work', name: '整体验收', images: [{ url: 'old.jpg' }], result: 'pass', note: '整体合格' },
    { id: 'exterior', kind: 'exterior', name: '外观', images: [{ url: 'out.jpg' }], result: 'pass', note: '' },
  ]
  const rows = buildAcceptanceRowsFromWorkItems(workItems, saved)
  assert.deepEqual(
    rows.map((row) => row.name),
    ['侧裙修复', '护板螺丝复紧', '外观'],
  )
  assert.equal(rows[0].note, '')
  assert.equal(rows[0].images.length, 0)
  assert.equal(rows[2].images[0].url, 'out.jpg')
})

test('本单还没有施工项目时保留已存行，避免清单空白', () => {
  const saved = [{ id: 'acc_1', kind: 'work', name: '整体验收', images: [], result: 'pass', note: '' }]
  const rows = buildAcceptanceRowsFromWorkItems([], saved)
  assert.equal(rows[0].name, '整体验收')
  assert.equal(rows[rows.length - 1].kind, 'exterior')
})

test('施工项目重名只留一行，外观行永远最后', () => {
  const rows = buildAcceptanceRowsFromWorkItems(
    [{ name: '喷漆' }, { name: '喷漆' }, { name: '保养' }],
    [{ id: 'exterior', kind: 'exterior', name: '外观', images: [{ url: 'out.jpg' }], result: 'observe', note: '' }],
  )
  assert.deepEqual(
    rows.map((row) => row.name),
    ['喷漆', '保养', '外观'],
  )
  assert.equal(rows[2].result, 'observe')
})
