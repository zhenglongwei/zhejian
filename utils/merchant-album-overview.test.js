const test = require('node:test')
const assert = require('node:assert/strict')
const { buildMerchantAlbumOverview, buildMerchantDocBrief } = require('./merchant-album-overview')

function node(partial) {
  return {
    id: partial.kind,
    status: 'completed',
    sortOrder: partial.sortOrder,
    photoCount: 0,
    previewImages: [],
    ...partial,
  }
}

test('施工中的详情用真实车牌和五张单据', () => {
  const view = buildMerchantAlbumOverview(
    {
      vehicle: { plate: '粤B7K52M', brand: '宝马', series: '3系', modelYear: '2021', mileage: 68420 },
      userPhone: '13700002021',
      userPhoneDisplay: '137****2021',
      createdAt: '2026-10-11T01:00:00.000Z',
    },
    [
      node({ kind: 'intake', sortOrder: 0, photoCount: 4 }),
      node({ kind: 'inspection', sortOrder: 1, photoDraft: { findings: [{ result: '状态良好' }, { result: '需处理' }] } }),
      node({
        kind: 'inspection_report',
        sortOrder: 2,
        document: { status: 'delivered', payload: { findings: [{ result: '状态良好' }, { result: '需处理' }] } },
      }),
      node({
        kind: 'quote_confirm',
        sortOrder: 3,
        document: { status: 'confirmed', payload: { lines: [{ amount: 2860 }] } },
      }),
      node({
        id: 'work',
        kind: 'work',
        sortOrder: 4,
        status: 'in_progress',
        photoCount: 4,
        photoDraft: { findings: [{ partName: '气门室盖垫' }] },
        previewImages: [{ url: 'https://example.com/a.jpg', caption: '施工前' }],
      }),
      node({ id: 'delivery', kind: 'delivery_photos', sortOrder: 5, status: 'locked' }),
      node({ id: 'repair', kind: 'repair_report', sortOrder: 6, status: 'locked', document: { status: 'draft' } }),
    ],
    new Date('2026-10-11T04:30:00.000Z'),
  )
  assert.equal(view.plate, '粤B·7K52M')
  assert.equal(view.pill.text, '施工中')
  assert.equal(view.vehicleName, '宝马 3系')
  assert.equal(view.spec, '2021款 · 里程 68,420 km')
  assert.match(view.meta, /137 \*\*\*\* 2021/)
  assert.deepEqual(
    view.docs.map((doc) => `${doc.title}:${doc.label}`),
    ['接车报告:已发出', '检测报告:已完成', '报价单:已确认', '维修工单:施工中'],
  )
  assert.equal(view.rows[2].detail, '¥2,860 · 已确认')
  assert.equal(view.rows[3].state, 'current')
  assert.equal(view.rows[3].shots.length, 1)
  assert.equal(view.rows[4].state, 'todo')
  assert.equal(view.action, '补充施工记录')
  assert.equal(view.timelineRows.map((row) => row.title).join(','), '接车建档,全面检测,首次报价,维修施工,完工交车')
})

test('空的补充报价不出现在全过程留证，写了项目才留下', () => {
  const album = { vehicle: { plate: '粤B7K52M', brand: '宝马', series: '3系' } }
  const base = [
    node({ kind: 'intake', sortOrder: 0, photoCount: 3 }),
    node({ kind: 'inspection', sortOrder: 1 }),
    node({ kind: 'inspection_report', sortOrder: 2, document: { status: 'delivered', payload: {} } }),
    node({
      kind: 'quote_confirm',
      sortOrder: 3,
      document: { status: 'confirmed', payload: { lines: [{ name: '下摆臂胶套', amount: 1400 }] } },
    }),
    node({
      id: 'work',
      kind: 'work',
      sortOrder: 4,
      status: 'in_progress',
      photoCount: 9,
      photoDraft: { findings: [{ partName: '下摆臂胶套' }] },
    }),
    node({ id: 'delivery', kind: 'delivery_photos', sortOrder: 6, status: 'locked' }),
    node({ id: 'repair', kind: 'repair_report', sortOrder: 7, status: 'locked' }),
  ]
  const blank = buildMerchantAlbumOverview(album, [
    ...base.slice(0, 5),
    node({
      id: 'addon',
      kind: 'quote_confirm',
      sortOrder: 5,
      status: 'in_progress',
      insertedReason: 'addon',
      document: { status: 'draft', payload: { lines: [{ name: '' }], discovery: { images: [], note: '' } } },
    }),
    ...base.slice(5),
  ])
  assert.equal(blank.timelineRows.map((row) => row.title).join(','), '接车建档,全面检测,首次报价,维修施工,完工交车')
  assert.equal(blank.timelineRows[3].mark, '进行中')
  assert.equal(blank.timelineRows[4].index, 5)
  assert.equal(blank.action, '补充施工记录')
  const named = buildMerchantAlbumOverview(album, [
    ...base.slice(0, 5),
    node({
      id: 'addon',
      kind: 'quote_confirm',
      sortOrder: 5,
      status: 'in_progress',
      insertedReason: 'addon',
      document: { status: 'draft', payload: { lines: [{ name: '下摆臂胶套', amount: 380 }] } },
    }),
    ...base.slice(5),
  ])
  assert.equal(named.timelineRows.map((row) => row.title).join(','), '接车建档,全面检测,首次报价,维修施工,补充报价,完工交车')
})

test('施工完成后，空的补充报价不挡住交车', () => {
  const view = buildMerchantAlbumOverview(
    { vehicle: { plate: '粤B7K52M', brand: '宝马', series: '3系' } },
    [
      node({ kind: 'intake', sortOrder: 0, photoCount: 3 }),
      node({ kind: 'inspection', sortOrder: 1 }),
      node({ kind: 'inspection_report', sortOrder: 2, document: { status: 'delivered', payload: {} } }),
      node({
        kind: 'quote_confirm',
        sortOrder: 3,
        document: { status: 'confirmed', payload: { lines: [{ name: '下摆臂胶套', amount: 1400 }] } },
      }),
      node({
        id: 'work',
        kind: 'work',
        sortOrder: 4,
        status: 'completed',
        photoCount: 9,
        photoDraft: { findings: [{ partName: '下摆臂胶套' }] },
      }),
      node({
        id: 'addon',
        kind: 'quote_confirm',
        sortOrder: 5,
        status: 'in_progress',
        insertedReason: 'addon',
        document: { status: 'draft', payload: { lines: [{ name: '' }] } },
      }),
      node({ id: 'delivery', kind: 'delivery_photos', sortOrder: 6, status: 'locked' }),
      node({ id: 'repair', kind: 'repair_report', sortOrder: 7, status: 'locked' }),
    ],
  )
  assert.equal(view.timelineRows.find((row) => row.state === 'current').title, '完工交车')
  assert.equal(view.timelineRows.find((row) => row.title === '维修施工').mark, '已完成')
  assert.equal(view.pill.text, '交车中')
  assert.equal(view.timelineRows.some((row) => row.title === '补充报价'), false)
})

test('单据简要层用真实项目，未确认不盖存证章', () => {
  const album = {
    storeName: '驰援汽车服务中心',
    serviceName: '发动机渗油维修',
    vehicle: { plate: '粤B7K52M', brand: '宝马', series: '3系', mileage: 68420 },
  }
  const nodes = [
    node({
      kind: 'inspection_report',
      sortOrder: 2,
      document: {
        status: 'delivered',
        payload: { findings: [{ partName: '气门室盖垫', result: '需处理' }] },
      },
    }),
    node({
      kind: 'quote_confirm',
      sortOrder: 3,
      document: {
        status: 'draft',
        payload: { lines: [{ name: '更换气门室盖垫', amount: 1680 }, { name: '施工服务费', amount: 600 }] },
      },
    }),
    node({ id: 'work', kind: 'work', sortOrder: 4, status: 'locked' }),
  ]
  const report = buildMerchantDocBrief(album, nodes, '检测报告')
  assert.equal(report.lines[0].name, '气门室盖垫')
  assert.equal(report.lines[0].amount, '')
  assert.equal(report.sealed, true)
  assert.equal(report.vehicleLine, '粤B·7K52M / 68,420km')
  const quote = buildMerchantDocBrief(album, nodes, '报价单')
  assert.equal(quote.totalText, '¥2,280')
  assert.equal(quote.sealed, false)
  assert.equal(quote.canSend, true)
  const pending = buildMerchantDocBrief(album, nodes, '交车报告')
  assert.equal(pending.emptyText, '还没有这份内容')
  assert.equal(pending.sealed, false)
  assert.equal(pending.canSend, false)
})

test('时间线只摘这一步自己的分析，交车不借用施工的补拍提示', () => {
  const view = buildMerchantAlbumOverview(
    { vehicle: { plate: '粤B12345', brand: '大众', series: '高尔夫' } },
    [
      node({ kind: 'intake', sortOrder: 0, status: 'completed' }),
      node({ kind: 'inspection', sortOrder: 1, status: 'completed' }),
      node({ kind: 'inspection_report', sortOrder: 2, status: 'completed', document: { status: 'delivered' } }),
      node({
        kind: 'quote_confirm',
        sortOrder: 3,
        status: 'completed',
        document: { status: 'confirmed', payload: { lines: [{ name: '下摆臂胶套', amount: 1400 }] } },
      }),
      node({
        id: 'work',
        kind: 'work',
        sortOrder: 4,
        status: 'completed',
        workAdvice: {
          status: 'ready',
          gaps: [{ kind: 'missing', title: '侧裙', body: '报价里的侧裙，施工没有做。' }],
          items: [],
        },
        photoDraft: { findings: [{ id: 'f1', partName: '下摆臂胶套', caption: '已经更换' }] },
      }),
      node({
        id: 'delivery',
        kind: 'delivery_photos',
        sortOrder: 5,
        status: 'in_progress',
        aiReview: { suggestions: [{ title: '侧裙/车门下沿修复近景' }] },
        deliveryAdvice: {
          status: 'ready',
          repair: { title: '这次维修', body: '已完成下摆臂胶套更换。' },
          warranty: { title: '质保', body: '质保期为1年。' },
          care: { title: '用车', body: '新喷漆部位避免高压水枪。' },
        },
      }),
      node({ id: 'repair', kind: 'repair_report', sortOrder: 6, status: 'in_progress', document: { status: 'draft' } }),
    ],
  )
  const work = view.timelineRows.find((row) => row.title === '维修施工')
  const finish = view.timelineRows.find((row) => row.title === '完工交车')
  assert.equal(work.advice, '报价里的侧裙，施工没有做。')
  assert.equal(finish.advice, '')
})

test('已经写上或只是告知的意见不进时间线', () => {
  const view = buildMerchantAlbumOverview(
    { vehicle: { plate: '粤B12345' } },
    [
      node({
        kind: 'intake',
        sortOrder: 0,
        status: 'completed',
        intakeAdvice: { status: 'ready', covered: true, risks: [], fixes: [] },
      }),
      node({ kind: 'inspection', sortOrder: 1, status: 'completed' }),
      node({ kind: 'inspection_report', sortOrder: 2, status: 'completed', document: { status: 'delivered' } }),
      node({
        kind: 'quote_confirm',
        sortOrder: 3,
        status: 'completed',
        document: { status: 'confirmed', payload: { lines: [{ name: '下摆臂胶套', amount: 1400 }] } },
      }),
      node({
        id: 'work',
        kind: 'work',
        sortOrder: 4,
        status: 'completed',
        workAdvice: {
          status: 'ready',
          gaps: [],
          items: [{ id: 'f1', partName: '下摆臂胶套', body: '已经更换胶套。' }],
        },
        photoDraft: { findings: [{ id: 'f1', partName: '下摆臂胶套', caption: '已经更换胶套。' }] },
      }),
      node({
        kind: 'delivery_photos',
        sortOrder: 5,
        status: 'in_progress',
        deliveryAdvice: { status: 'ready', repair: { body: '已完成下摆臂胶套更换。' } },
      }),
      node({ kind: 'repair_report', sortOrder: 6, status: 'in_progress', document: { status: 'draft' } }),
    ],
  )
  const intake = view.timelineRows.find((row) => row.title === '接车建档')
  const work = view.timelineRows.find((row) => row.title === '维修施工')
  const finish = view.timelineRows.find((row) => row.title === '完工交车')
  assert.equal(intake.advice, '')
  assert.equal(work.advice, '')
  assert.equal(finish.advice, '')
})
