const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  writeMaskedUrlIntoFlowNodes,
  applyMaskedToSlot,
} = require('./flow-photo-mask-writeback')

const RAW = 'https://cdn.example/files/uploads/2026/10/plate.jpg'
const MASK = 'https://cdn.example/files/uploads/desensitized/plate_m.jpg'

test('字符串交车图升为带 maskedUrl 的对象', () => {
  const { nodes, changed } = writeMaskedUrlIntoFlowNodes(
    [
      {
        kind: 'repair_report',
        document: { payload: { deliveryPhotos: [RAW] } },
      },
    ],
    RAW,
    MASK,
  )
  assert.equal(changed, true)
  assert.deepEqual(nodes[0].document.payload.deliveryPhotos[0], {
    url: RAW,
    maskedUrl: MASK,
  })
})

test('对象交车图写回 maskedUrl 不改原图地址', () => {
  const { nodes, changed } = writeMaskedUrlIntoFlowNodes(
    [
      {
        kind: 'repair_report',
        document: {
          payload: { deliveryPhotos: [{ url: RAW, caption: '外观' }] },
        },
      },
    ],
    RAW,
    MASK,
  )
  assert.equal(changed, true)
  assert.equal(nodes[0].document.payload.deliveryPhotos[0].url, RAW)
  assert.equal(nodes[0].document.payload.deliveryPhotos[0].maskedUrl, MASK)
  assert.equal(nodes[0].document.payload.deliveryPhotos[0].caption, '外观')
})

test('检测挂图 images[] 写回', () => {
  const { nodes, changed } = writeMaskedUrlIntoFlowNodes(
    [
      {
        kind: 'inspection_report',
        document: {
          payload: {
            findings: [{ partName: '机油', images: [{ url: RAW }] }],
          },
        },
      },
    ],
    RAW,
    MASK,
  )
  assert.equal(changed, true)
  assert.equal(nodes[0].document.payload.findings[0].images[0].maskedUrl, MASK)
})

test('未命中原图不改动', () => {
  const r = applyMaskedToSlot({ url: 'https://other/a.jpg' }, new Set([RAW]), MASK)
  assert.equal(r.changed, false)
})

test('写回不得把 selectedDeliveryUrls 字符串升成对象', () => {
  const { writeMaskedUrlIntoFlowNodes } = require('./flow-photo-mask-writeback')
  const { nodes, changed } = writeMaskedUrlIntoFlowNodes(
    [
      {
        kind: 'delivery_photos',
        photoDraft: { selectedDeliveryUrls: [RAW], deliveryExteriorUrl: RAW },
      },
    ],
    RAW,
    MASK,
  )
  assert.equal(changed, true)
  assert.deepEqual(nodes[0].photoDraft.selectedDeliveryUrls, [RAW])
  assert.equal(nodes[0].photoDraft.deliveryExteriorMaskedUrl, MASK)
})

test('收集节点上的原图和打码图', () => {
  const { collectFlowImageRefs } = require('./flow-photo-mask-writeback')
  const refs = collectFlowImageRefs([
    {
      kind: 'inspection',
      content: {
        findings: [{ images: [{ url: RAW, maskedUrl: MASK }] }],
      },
    },
  ])
  assert.deepEqual(refs, [{ url: RAW, maskedUrl: MASK }])
})
