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
        id: 'e',
        kind: 'work',
        sortOrder: 3,
        photoDraft: {
          findings: [
            {
              partName: '阀体',
              caption: '拆下旧阀体',
              material: '阀体总成',
              brand: '原厂',
              qty: '1 个',
              amount: 2800,
              images: [{ url: RAW }],
            },
          ],
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
  // 工单＝如实记录施工过程的单据，报价派生的旧 work_order 节点已下线
  assert.deepEqual(titles, ['检测报告', '方案', '工单', '完工'])
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
  // 工单条目带用料/品牌/数量，公网侧不带金额
  assert.equal(work.items[0].name, '阀体')
  assert.match(work.items[0].note, /阀体总成/)
  assert.match(work.items[0].note, /原厂/)
  assert.equal(work.items[0].amount, undefined)
})

test('buildPublicServiceFlow 用核对打码图覆盖事实层原图', () => {
  const flow = buildPublicServiceFlow({
    flowNodes: [
      {
        id: 'e',
        kind: 'work',
        sortOrder: 4,
        photoDraft: {
          findings: [{ partName: '阀体', caption: '施工', images: [{ url: RAW }] }],
        },
      },
    ],
    album: { images: [{ url: RAW }] },
    maskLookup: new Map([[RAW, MASK]]),
  })
  assert.equal(flow.chapters[0].photos[0].url, MASK)
})

test('交车图经 maskLookup 换成打码图，不回落原图', () => {
  const flow = buildPublicServiceFlow({
    flowNodes: [
      {
        id: 'f',
        kind: 'repair_report',
        sortOrder: 6,
        document: {
          status: 'confirmed',
          payload: {
            warrantyPeriod: '12 个月',
            deliveryPhotos: [{ url: RAW, caption: '交车外观' }],
          },
        },
      },
    ],
    maskLookup: { byRawUrl: new Map([[RAW, MASK]]) },
    allowPrivateFallback: true,
  })
  const done = flow.chapters.find((c) => c.kind === 'repair_report')
  assert.ok(done)
  assert.equal(done.photos[0].url, MASK)
})

test('maskLookup 产物 URL 非标准脱敏路径时仍写入映射', () => {
  const oddMasked = 'https://cdn.example.com/custom/out/masked-delivery.jpg'
  const flow = buildPublicServiceFlow({
    flowNodes: [
      {
        id: 'f',
        kind: 'repair_report',
        sortOrder: 6,
        document: {
          status: 'confirmed',
          payload: {
            warrantyPeriod: '12 个月',
            deliveryPhotos: [{ url: RAW }],
          },
        },
      },
    ],
    maskLookup: new Map([[RAW, oddMasked]]),
    allowPrivateFallback: true,
  })
  const done = flow.chapters.find((c) => c.kind === 'repair_report')
  assert.equal(done.photos[0].url, oddMasked)
})

test('contentNodes 原图不得覆盖 maskLookup 打码映射', () => {
  const flow = buildPublicServiceFlow({
    flowNodes: [
      {
        id: 'f',
        kind: 'repair_report',
        sortOrder: 6,
        document: {
          status: 'confirmed',
          payload: {
            warrantyPeriod: '12 个月',
            deliveryPhotos: [{ url: RAW, caption: '交车' }],
          },
        },
      },
    ],
    contentNodes: [{ images: [{ url: RAW }] }],
    maskLookup: { byRawUrl: new Map([[RAW, MASK]]) },
    allowPrivateFallback: true,
  })
  const done = flow.chapters.find((c) => c.kind === 'repair_report')
  assert.equal(done.photos[0].url, MASK)
})

test('工单图与交车图不同原图时互不串码', () => {
  const WORK_RAW = 'https://cdn.example.com/files/uploads/2026/08/work_only.jpg'
  const WORK_MASK = 'https://cdn.example.com/files/uploads/desensitized/work_only.jpg'
  const DEL_RAW = 'https://cdn.example.com/files/uploads/2026/08/delivery_only.jpg'
  const DEL_MASK = 'https://cdn.example.com/files/uploads/desensitized/delivery_only.jpg'
  const flow = buildPublicServiceFlow({
    flowNodes: [
      {
        id: 'e',
        kind: 'work',
        sortOrder: 3,
        photoDraft: {
          findings: [{ partName: '阀体', images: [{ url: WORK_RAW, maskedUrl: WORK_MASK }] }],
        },
      },
      {
        id: 'f',
        kind: 'repair_report',
        sortOrder: 6,
        document: {
          status: 'confirmed',
          payload: {
            warrantyPeriod: '12 个月',
            deliveryPhotos: [{ url: DEL_RAW, maskedUrl: DEL_MASK, caption: '交车' }],
          },
        },
      },
    ],
    contentNodes: [],
    allowPrivateFallback: true,
  })
  const work = flow.chapters.find((c) => c.kind === 'work')
  const done = flow.chapters.find((c) => c.kind === 'repair_report')
  assert.equal(work.photos[0].url, WORK_MASK)
  assert.equal(done.photos[0].url, DEL_MASK)
  assert.notEqual(work.photos[0].url, done.photos[0].url)
})

test('节点图对象已写回 maskedUrl 时预览直接读节点字段', () => {
  const flow = buildPublicServiceFlow({
    flowNodes: [
      {
        id: 'f',
        kind: 'repair_report',
        sortOrder: 6,
        document: {
          status: 'confirmed',
          payload: {
            warrantyPeriod: '12 个月',
            deliveryPhotos: [{ url: RAW, maskedUrl: MASK, caption: '交车' }],
          },
        },
      },
    ],
    contentNodes: [],
    allowPrivateFallback: true,
  })
  const done = flow.chapters.find((c) => c.kind === 'repair_report')
  assert.equal(done.photos[0].url, MASK)
})

test('托管完工章只读已生成的交车报告', () => {
  const flow = buildPublicServiceFlow({
    flowNodes: [
      {
        id: 'f',
        kind: 'repair_report',
        sortOrder: 6,
        document: {
          status: 'pending_confirm',
          payload: {
            repairBrief: '右前门补漆完成',
            warrantyPeriod: '12 个月',
            warrantyNotes: '不含事故损伤',
            deliveryPhotos: [{ url: RAW }],
          },
        },
      },
    ],
    album: { images: [{ url: RAW, maskedUrl: MASK }] },
    contentNodes: [],
    allowPrivateFallback: true,
  })
  const done = flow.chapters.find((c) => c.kind === 'repair_report')
  assert.ok(done)
  assert.equal(done.repairBrief, '右前门补漆完成')
  assert.equal(done.warrantyPeriod, '12 个月')
  assert.match(done.warrantyNotes, /事故/)
  assert.ok(done.photos.length >= 1)
})

test('托管完工章：报告为空时不从交车底稿拼', () => {
  const flow = buildPublicServiceFlow({
    flowNodes: [
      {
        id: 'd',
        kind: 'delivery_photos',
        sortOrder: 5,
        status: 'completed',
        content: {
          repairBrief: '右前门补漆完成',
          warrantyPeriod: '12 个月',
          warrantyNotes: '不含事故损伤',
          deliveryExteriorUrl: RAW,
          selectedDeliveryUrls: [WORK],
        },
      },
      {
        id: 'f',
        kind: 'repair_report',
        sortOrder: 6,
        document: {
          status: 'pending_confirm',
          payload: {},
        },
      },
    ],
    album: { images: [{ url: RAW, maskedUrl: MASK }] },
    contentNodes: [],
    allowPrivateFallback: true,
  })
  const done = flow.chapters.find((c) => c.kind === 'repair_report')
  assert.equal(done, undefined)
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

test('公开页去掉未填占位，质保说明为「无」时不展示', () => {
  const flow = buildPublicServiceFlow({
    flowNodes: [
      {
        id: 'f',
        kind: 'repair_report',
        sortOrder: 6,
        document: {
          status: 'confirmed',
          payload: {
            workItems: [
              {
                name: '更换机油机滤',
                note: '已更换全新[品牌]机油（规格：[粘度]）及原厂机滤',
              },
            ],
            warrantyPeriod: '2年',
            warrantyNotes: '无',
          },
        },
      },
    ],
  })
  const done = flow.chapters.find((c) => c.kind === 'repair_report')
  assert.equal(done.items[0].note, '已更换全新机油及原厂机滤')
  assert.equal(done.warrantyPeriod, '2年')
  assert.equal(done.warrantyNotes, '')
})

test('工单说明去掉方括号占位，检测建议不重复部位名', () => {
  const flow = buildPublicServiceFlow({
    flowNodes: [
      {
        id: 'b',
        kind: 'inspection_report',
        sortOrder: 1,
        document: {
          status: 'delivered',
          payload: {
            findings: [{ partName: '滤芯', advice: '滤芯空气滤芯滤纸表面积尘较多' }],
          },
        },
      },
      {
        id: 'e',
        kind: 'work',
        sortOrder: 3,
        photoDraft: {
          findings: [
            {
              partName: '更换机油机滤',
              caption: '已更换全新[品牌]机油（规格：[粘度]）及原厂机滤',
              images: [{ url: WORK }],
            },
          ],
        },
      },
    ],
    contentNodes: [{ images: [WORK] }],
  })
  const inspect = flow.chapters.find((c) => c.kind === 'inspection_report')
  assert.equal(inspect.findings[0].advice, '空气滤芯滤纸表面积尘较多')
  const work = flow.chapters.find((c) => c.kind === 'work')
  assert.equal(work.items[0].note, '已更换全新机油及原厂机滤')
  assert.equal(work.photos[0].caption, '更换机油机滤 · 已更换全新机油及原厂机滤')
})

test('requireDesensitized 时无映射不得回落原图', () => {
  const flow = buildPublicServiceFlow({
    flowNodes: [
      {
        id: 'f',
        kind: 'repair_report',
        sortOrder: 6,
        document: {
          status: 'confirmed',
          payload: {
            warrantyPeriod: '12 个月',
            deliveryPhotos: [{ url: RAW, caption: '交车外观' }],
          },
        },
      },
    ],
    requireDesensitized: true,
    allowPrivateFallback: true,
  })
  const done = flow.chapters.find((c) => c.kind === 'repair_report')
  assert.ok(done)
  assert.equal((done.photos || []).length, 0)
})

test('requireDesensitized 时有映射只出打码图', () => {
  const flow = buildPublicServiceFlow({
    flowNodes: [
      {
        id: 'f',
        kind: 'repair_report',
        sortOrder: 6,
        document: {
          status: 'confirmed',
          payload: {
            warrantyPeriod: '12 个月',
            deliveryPhotos: [{ url: RAW }],
          },
        },
      },
    ],
    maskLookup: { byRawUrl: new Map([[RAW, MASK]]) },
    requireDesensitized: true,
  })
  const done = flow.chapters.find((c) => c.kind === 'repair_report')
  assert.ok(done)
  assert.equal(done.photos[0].url, MASK)
})

test('ok_no_privacy 公开预览可展示原图，不要求复制打码产物', () => {
  const { resolvePhotoDisplayUrl } = require('./public-service-flow')
  const lookup = new Map()
  lookup._requireDesensitized = true
  const url = resolvePhotoDisplayUrl(
    { url: RAW, maskOutcome: 'ok_no_privacy', maskedUrl: '' },
    lookup,
  )
  assert.equal(url, RAW)

  const flow = buildPublicServiceFlow({
    flowNodes: [
      {
        id: 'f',
        kind: 'repair_report',
        sortOrder: 6,
        document: {
          status: 'confirmed',
          payload: {
            warrantyPeriod: '12 个月',
            deliveryPhotos: [{ url: RAW, maskOutcome: 'ok_no_privacy' }],
          },
        },
      },
    ],
    requireDesensitized: true,
  })
  const done = flow.chapters.find((c) => c.kind === 'repair_report')
  assert.ok(done)
  assert.equal(done.photos[0].url, RAW)
})

