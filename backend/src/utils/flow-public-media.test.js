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

test('接车/报价图不算可公示；施工/交车算', () => {
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
  ])
  const list = collectPublicizableFlowPhotos(album)
  assert.equal(countPublicizableFlowPhotos(album), 3)
  assert.deepEqual(
    list.map((r) => r.url).sort(),
    ['https://x/d2.jpg', 'https://x/out.jpg', 'https://x/work.jpg'].sort(),
  )
  const meta = mapFlowImageMeta(album)
  assert.equal(meta.length, 3)
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
