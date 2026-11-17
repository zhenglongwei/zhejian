const test = require('node:test')
const assert = require('node:assert/strict')
const {
  collectPublicizableFlowPhotos,
  countPublicizableFlowPhotos,
  countAllFlowPhotos,
  buildFlowNodeViews,
  mapFlowImageMeta,
  albumUsesFlowNodes,
} = require('./flow-public-media')

function albumWithFlow(nodes) {
  return { contentPackageJson: { flowNodes: nodes } }
}

test('有 flowNodes 即走节点真源', () => {
  assert.equal(albumUsesFlowNodes(albumWithFlow([{ kind: 'work' }])), true)
  assert.equal(albumUsesFlowNodes({ contentPackageJson: {} }), false)
})

test('接车/报价/整车外观照不算可公示；施工图与交车施工验收图算', () => {
  const album = albumWithFlow([
    {
      id: 'n1',
      kind: 'intake',
      content: { pendingImages: [{ url: 'https://x/intake.jpg' }] },
    },
    {
      id: 'n2',
      kind: 'quote_confirm',
      content: { lines: [{ name: '机油', images: [{ url: 'https://x/quote.jpg' }] }] },
    },
    {
      id: 'n3',
      kind: 'work',
      content: {
        findings: [{ partName: '下摆臂', images: [{ url: 'https://x/work.jpg', maskOutcome: 'ok_no_privacy' }] }],
      },
    },
    {
      id: 'n4',
      kind: 'delivery_photos',
      content: {
        acceptanceItems: [
          {
            id: 'exterior',
            kind: 'exterior',
            name: '外观',
            result: 'pass',
            images: [{ url: 'https://x/out.jpg' }, { url: 'https://x/d2.jpg' }],
          },
        ],
      },
    },
    {
      id: 'n5',
      kind: 'repair_report',
      content: {
        acceptanceItems: [{ id: 'acc_1', kind: 'work', name: '换刹车片', images: [{ url: 'https://x/acc.jpg' }] }],
      },
    },
    {
      id: 'n6',
      kind: 'repair_report',
      content: {
        acceptanceItems: [
          {
            id: 'acc_2',
            kind: 'work',
            name: '四轮定位',
            unbuiltReason: 'customer_declined',
            images: [{ url: 'https://x/giveup.jpg' }],
          },
        ],
      },
    },
  ])
  const list = collectPublicizableFlowPhotos(album)
  assert.equal(countPublicizableFlowPhotos(album), 2)
  assert.deepEqual(list.map((r) => r.url), ['https://x/work.jpg', 'https://x/acc.jpg'])
  const meta = mapFlowImageMeta(album)
  assert.equal(meta.length, 2)
  assert.ok(meta.every((m) => m.visibility === 'public' && m.publicGateStatus === 'passed'))
})

test('节点视图用流程域 nodeId 和标题，说明回落检测结论', () => {
  const album = albumWithFlow([
    {
      id: 'fn_002',
      kind: 'inspect',
      title: '检测',
      status: 'done',
      content: { conclusion: '左前轮胎老化', findings: [{ images: [{ url: 'https://x/a.jpg' }] }] },
    },
    { id: 'fn_006', kind: 'delivery_photos', title: '完工照', status: 'done', note: '四项已验收' },
  ])
  const views = buildFlowNodeViews(album)
  assert.deepEqual(views.map((v) => v.id), ['fn_002', 'fn_006'])
  assert.equal(views[0].title, '检测')
  assert.equal(views[0].note, '左前轮胎老化')
  assert.equal(views[0].kind, 'inspect')
  assert.equal(views[1].note, '四项已验收')
  assert.deepEqual(views[0].images, [])
  // 全部流程照片（含接车/报价）用于相册图片数兜底
  assert.equal(countAllFlowPhotos(albumWithFlow([
    { id: 'fn_001', kind: 'intake', content: { pendingImages: [{ url: 'https://x/i1.jpg' }, { url: 'https://x/i2.jpg' }] } },
    { id: 'fn_002', kind: 'inspect', content: { findings: [{ images: [{ url: 'https://x/i1.jpg' }, { url: 'https://x/d.jpg' }] }] } },
  ])), 3)
})

test('补充报价的图可公示，节点视图按 sortOrder 输出并带新发现说明', () => {
  const album = albumWithFlow([
    {
      id: 'fn_work',
      kind: 'work',
      sortOrder: 3,
      title: '维修工单',
      status: 'completed',
      content: { findings: [] },
    },
    {
      id: 'fn_addon_q',
      kind: 'quote_confirm',
      insertedReason: 'addon',
      sortOrder: 2,
      title: '补充报价',
      status: 'in_progress',
      content: {
        lines: [],
        discovery: { note: '右后轮扎钉', images: ['https://x/tire.jpg'] },
      },
      document: {
        status: 'pending_confirm',
      },
    },
    {
      id: 'fn_addon_w',
      kind: 'work',
      insertedReason: 'addon',
      sortOrder: 4,
      title: '补充施工',
      status: 'locked',
      content: { findings: [] },
    },
  ])
  const urls = collectPublicizableFlowPhotos(album).map((row) => row.url)
  assert.deepEqual(urls, ['https://x/tire.jpg'])
  const views = buildFlowNodeViews(album)
  assert.deepEqual(
    views.map((view) => view.id),
    ['fn_addon_q', 'fn_work', 'fn_addon_w'],
  )
  assert.equal(views[0].note, '右后轮扎钉')
})
