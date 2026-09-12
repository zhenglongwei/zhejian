const test = require('node:test')
const assert = require('node:assert/strict')
const { buildPublicServiceFlow } = require('./public-service-flow')

const MASK = 'https://cdn.example.com/files/uploads/desensitized/valve.jpg'
const RAW = 'https://cdn.example.com/files/uploads/2026/08/raw.jpg'
const WORK = 'https://cdn.example.com/files/uploads/desensitized/work.jpg'

test('buildPublicServiceFlow 按单据链排并单独成章施工，去掉金额', () => {
  const flow = buildPublicServiceFlow({
    flowNodes: [
      { id: 'a', kind: 'intake_inspection', sortOrder: 0, photoDraft: {} },
      {
        id: 'b',
        kind: 'inspection_report',
        sortOrder: 1,
        document: {
          status: 'delivered',
          payload: {
            chiefComplaint: '顿挫',
            findings: [{ url: RAW, partName: '阀体', result: '需处理', advice: '更换阀体' }],
          },
        },
      },
      {
        id: 'c',
        kind: 'quote_confirm',
        sortOrder: 2,
        document: {
          status: 'confirmed',
          payload: {
            lines: [{ name: '阀体', amount: 2800, note: '更换阀体总成' }],
            confirmCopy: '本人同意按上述项目施工',
          },
        },
      },
      {
        id: 'd',
        kind: 'work_order',
        sortOrder: 3,
        document: {
          status: 'completed',
          payload: { items: [{ name: '阀体', amount: 2800 }] },
        },
      },
      {
        id: 'e',
        kind: 'work',
        sortOrder: 4,
        photoDraft: {
          findings: [{ partName: '阀体', caption: '拆下旧阀体', images: [{ url: RAW }] }],
        },
      },
      {
        id: 'f',
        kind: 'repair_report',
        sortOrder: 6,
        document: {
          status: 'confirmed',
          payload: {
            workItems: [{ name: '阀体', amount: 2800 }],
            warrantyPeriod: '12 个月',
            deliveryPhotos: [{ url: RAW, caption: '交车外观' }],
          },
        },
      },
    ],
    album: {
      images: [{ url: RAW, maskedUrl: MASK }],
    },
    contentNodes: [],
  })

  const titles = flow.chapters.map((c) => c.title)
  assert.deepEqual(titles, ['检测报告', '方案', '工单', '施工', '完工'])
  const quote = flow.chapters.find((c) => c.kind === 'quote_confirm')
  assert.equal(quote.items[0].name, '阀体')
  assert.equal(quote.items[0].amount, undefined)
  const report = flow.chapters.find((c) => c.kind === 'inspection_report')
  assert.equal(report.findings[0].partName, '阀体')
  assert.equal(report.findings[0].result, undefined)
  assert.equal(report.findings[0].url, MASK)
  const work = flow.chapters.find((c) => c.kind === 'work')
  assert.equal(work.photos[0].url, MASK)
  assert.match(work.photos[0].caption, /拆下旧阀体/)
})

test('buildPublicServiceFlow 无流转则空章节', () => {
  assert.deepEqual(buildPublicServiceFlow({}).chapters, [])
})

test('施工中新发现使用产品名', () => {
  const flow = buildPublicServiceFlow({
    flowNodes: [
      {
        id: 'q',
        kind: 'quote_confirm',
        insertedReason: 'addon',
        sortOrder: 5,
        document: {
          status: 'confirmed',
          payload: { lines: [{ name: '垫片', amount: 80, evidenceUrl: WORK }] },
        },
      },
    ],
    contentNodes: [{ images: [WORK] }],
  })
  assert.equal(flow.chapters[0].title, '施工中新发现')
  assert.equal(flow.chapters[0].items[0].amount, undefined)
})
