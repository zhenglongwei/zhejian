const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizePhotoDraft,
  mapFindingRows,
  buildInspectionReportPayload,
  collectInspectionReportGaps,
} = require('./service-flow-docs')

const hydraulic = {
  partName: '液压位',
  result: '需处理',
  advice: '机油尺油位处于下限刻度附近，建议补充。',
  url: 'https://cdn.example/api/v1/media/files/uploads/a.jpg',
  images: [
    { url: 'https://cdn.example/api/v1/media/files/uploads/a.jpg', imageId: '1' },
    { url: 'https://cdn.example/api/v1/media/files/uploads/b.jpg', imageId: '2' },
  ],
}

test('saving a multi-photo inspection item keeps result and advice', () => {
  const saved = normalizePhotoDraft({
    chiefComplaint: '漏油',
    findings: [hydraulic],
  }).findings[0]
  assert.equal(saved.result, '需处理')
  assert.match(saved.advice, /机油尺/)
  assert.equal(saved.images.length, 2)
  assert.equal(saved.partName, '液压位')
})

test('explicit empty photos are not restored from a leftover url', () => {
  const saved = normalizePhotoDraft({
    findings: [{ partName: '液压位', result: '需处理', advice: '补油', url: 'https://old.jpg', images: [] }],
  }).findings[0]
  assert.equal(saved.images.length, 0)
  assert.equal(saved.result, '需处理')
})

test('submit keeps the item when album urls do not match its photos', () => {
  const report = buildInspectionReportPayload({
    chiefComplaint: '漏油',
    findings: [hydraulic],
    albumNodes: [{
      id: 'stage_2',
      images: [
        { url: 'https://cdn.example/media/uploads/odo.jpg', caption: '仪表' },
        { url: 'https://cdn.example/other/new-a.jpg', caption: '液压位' },
      ],
    }],
    photoDraft: {
      odometerUrl: 'https://cdn.example/media/uploads/odo.jpg',
      findings: [hydraulic],
    },
  })
  assert.equal(report.findings.length, 1)
  assert.equal(report.findings[0].partName, '液压位')
  assert.equal(report.findings[0].result, '需处理')
  assert.ok(report.findings[0].images.length >= 2)
  assert.deepEqual(collectInspectionReportGaps(report), [])
})

test('a photo that is not on any item and has another part becomes its own item', () => {
  const rows = mapFindingRows(
    [
      { url: 'https://cdn.example/api/v1/media/files/uploads/a.jpg', caption: '液压位' },
      { url: 'https://cdn.example/api/v1/media/files/uploads/c.jpg', caption: '滤芯' },
    ],
    [hydraulic],
  )
  assert.equal(rows.length, 2)
  assert.equal(rows[0].result, '需处理')
  assert.equal(rows[1].partName, '滤芯')
  assert.equal(rows[1].result, '')
})

test('work item with photos and no inspection result still saves', () => {
  const saved = normalizePhotoDraft({
    findings: [{
      partName: '更换机油',
      caption: '已紧固',
      images: [{ url: 'https://cdn.example/api/v1/media/files/uploads/w.jpg' }],
    }],
  }).findings[0]
  assert.equal(saved.partName, '更换机油')
  assert.equal(saved.caption, '已紧固')
  assert.equal(saved.result, '')
  assert.equal(saved.images.length, 1)
})
