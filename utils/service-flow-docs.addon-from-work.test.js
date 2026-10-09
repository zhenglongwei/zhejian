const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildAddonDraftFromWorkFindings,
  addonDraftStillBlank,
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
