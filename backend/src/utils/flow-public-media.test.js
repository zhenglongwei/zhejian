const test = require('node:test')
const assert = require('node:assert/strict')
const {
  collectPublicizableFlowPhotos,
  countPublicizableFlowPhotos,
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
      content: { deliveryExteriorUrl: 'https://x/out.jpg', deliveryPhotos: [{ url: 'https://x/d2.jpg' }] },
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
