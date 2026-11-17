const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildAddonDraftFromWorkFindings,
  addonDraftStillBlank,
  collectQuotedLines,
} = require('./service-flow-docs')

test('no outside-quote items stay a blank addon draft', () => {
  const draft = buildAddonDraftFromWorkFindings([
    { id: 'in', partName: '机油', outsideQuote: false, images: [{ url: 'https://a/in.jpg' }] },
  ])
  assert.equal(draft.seeded, false)
  assert.equal(draft.discovery.ready, false)
  assert.equal(draft.lines.length, 1)
  assert.equal(draft.lines[0].name, '')
})

test('all outside-quote work items seed one addon with photos and copy', () => {
  const draft = buildAddonDraftFromWorkFindings([
    {
      id: 'f1',
      partName: '下摆臂胶套',
      caption: '衬套开裂',
      material: '更换下摆臂胶套',
      outsideQuote: true,
      images: [{ url: 'https://a/arm.jpg' }, { url: 'https://a/arm2.jpg' }],
    },
    {
      id: 'f2',
      partName: '制动盘',
      caption: '盘面磨损',
      outsideQuote: true,
      images: [{ url: 'https://a/disc.jpg' }],
    },
    {
      id: 'f3',
      partName: '机油',
      outsideQuote: false,
      images: [{ url: 'https://a/oil.jpg' }],
    },
  ])
  assert.equal(draft.seeded, true)
  assert.equal(draft.lines.length, 2)
  assert.equal(draft.lines[0].workFindingId, 'f1')
  assert.equal(draft.lines[0].name, '下摆臂胶套')
  assert.equal(draft.lines[0].note.includes('衬套开裂'), true)
  assert.deepEqual(draft.lines[0].evidenceUrls, ['https://a/arm.jpg', 'https://a/arm2.jpg'])
  assert.equal(draft.lines[1].workFindingId, 'f2')
  assert.equal(draft.lines[1].name, '制动盘')
  assert.equal(draft.lines[0].amount, '')
  assert.equal(draft.discovery.ready, true)
  assert.equal(draft.discovery.images.length, 3)
  assert.equal(draft.discovery.note.includes('下摆臂胶套'), true)
  assert.equal(draft.discovery.note.includes('制动盘'), true)
})

test('blank detector ignores empty shell lines', () => {
  assert.equal(
    addonDraftStillBlank({
      lines: [{ name: '' }],
      discovery: { images: [], note: '', ready: false },
    }),
    true,
  )
  assert.equal(
    addonDraftStillBlank({
      lines: [{ name: '下摆臂胶套', evidenceUrls: ['https://a/arm.jpg'] }],
      discovery: { images: ['https://a/arm.jpg'], note: '下摆臂胶套：衬套开裂', ready: true },
    }),
    false,
  )
})

test('历次报价汇总按节点顺序包含补充报价，排除当前单和撤销单', () => {
  const nodes = [
    {
      id: 'q2',
      kind: 'quote_confirm',
      insertedReason: 'addon',
      sortOrder: 3,
      content: { lines: [{ name: '第二次补充项目', amount: '300' }] },
      document: { status: 'draft' },
    },
    {
      id: 'q0',
      kind: 'quote_confirm',
      sortOrder: 1,
      content: { lines: [{ id: 'l0', name: '首次报价项目', amount: 100, note: '首报' }, { name: ' ' }] },
      document: { status: 'confirmed' },
    },
    {
      id: 'q1',
      kind: 'quote_confirm',
      insertedReason: 'addon',
      sortOrder: 2,
      content: { lines: [{ name: '第一次补充项目', amount: '200' }] },
      document: {
        status: 'confirmed',
      },
    },
    {
      id: 'qx',
      kind: 'quote_confirm',
      insertedReason: 'addon',
      sortOrder: 4,
      content: { lines: [{ name: '已撤销项目', amount: '400' }] },
      document: { status: 'cancelled' },
    },
  ]

  const all = collectQuotedLines(nodes)
  assert.deepEqual(all.map((row) => row.name), ['首次报价项目', '第一次补充项目', '第二次补充项目'])
  assert.deepEqual(all.map((row) => row.source), ['first', 'addon', 'addon'])
  assert.deepEqual(all.map((row) => row.quoteLabel), ['首次报价', '补充报价1', '补充报价2'])
  assert.equal(all[0].amount, '100')

  const prior = collectQuotedLines(nodes, { excludeNodeId: 'q2' })
  assert.deepEqual(prior.map((row) => row.name), ['首次报价项目', '第一次补充项目'])
  assert.equal(prior.some((row) => row.name === '已撤销项目'), false)
})
