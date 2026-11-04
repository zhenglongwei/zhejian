const test = require('node:test')
const assert = require('node:assert/strict')
const { scrubPiiText } = require('../utils/scrub-pii-text')
const {
  buildPublicRepairPlan,
  buildPublicView,
  publicViewToSnapshotNodes,
  pickPublicViewCover,
} = require('./build-public-view.service')
const { isAlwaysPrivateStage } = require('../constants/album-public-visibility-policy')

test('scrubPiiText masks phone and plate patterns', () => {
  const out = scrubPiiText('联系13812345678，车牌浙A12345')
  assert.match(out, /手机号已隐藏/)
  assert.match(out, /车牌已隐藏/)
})

test('buildPublicRepairPlan uses note and planParts, hides planAmount (公域藏价)', () => {
  const text = buildPublicRepairPlan({
    nodes: [{ id: 'stage_3', note: '更换刹车片' }],
    planParts: [{ name: '刹车片', partType: '品牌件' }],
    planAmount: 680,
  })
  assert.match(text, /更换刹车片/)
  assert.match(text, /刹车片/)
  assert.doesNotMatch(text, /680/)
})

test('buildPublicView excludes private stage images', () => {
  const albumView = {
    serviceName: '刹车保养',
    planAmount: 680,
    store: { id: 'st_1', name: '测试门店', city: '杭州' },
    storeNote: '',
    planParts: [],
    nodes: [
      { id: 'stage_3', title: '方案', note: '更换刹车片', images: [] },
      { id: 'stage_4', title: '配件', note: '新片', images: [] },
    ],
    imageMeta: [
      {
        nodeId: 'stage_3',
        idx: 0,
        rawUrl: 'https://x/a.jpg',
        visibility: 'private',
        publicGateStatus: 'skipped',
      },
      {
        nodeId: 'stage_4',
        idx: 0,
        rawUrl: 'https://x/b.jpg',
        visibility: 'public',
        publicGateStatus: 'passed',
      },
    ],
  }
  const task = {
    rawAssets: [
      { nodeId: 'stage_4', idx: 0, maskedUrl: 'https://x/files/uploads/desensitized/b.jpg' },
    ],
  }
  const view = buildPublicView(albumView, task, { authorizationTier: 'named' })
  assert.equal(view.media.length, 1)
  assert.equal(view.media[0].nodeId, 'stage_4')
  assert.match(view.facts.repairPlan, /更换刹车片/)
  const nodes = publicViewToSnapshotNodes(view, albumView.nodes)
  assert.equal(nodes.length, 1)
  assert.equal(nodes[0].images.length, 1)
})

test('buildPublicView prefers node write-back maskedUrl over task lookup', () => {
  const albumView = {
    serviceName: '刹车保养',
    planAmount: 680,
    store: { id: 'st_1', name: '测试门店', city: '杭州' },
    storeNote: '',
    planParts: [],
    nodes: [{ id: 'stage_4', title: '配件', note: '新片', images: [] }],
    imageMeta: [
      {
        nodeId: 'stage_4',
        idx: 0,
        rawUrl: 'https://x/b.jpg',
        visibility: 'public',
        publicGateStatus: 'passed',
        maskedUrl: 'https://x/files/uploads/desensitized/node-writeback.jpg',
      },
    ],
  }
  // 无 task：旧逻辑会落到门店自处理原图，公开读侧剥掉后内容消失
  const view = buildPublicView(albumView, null, {
    authorizationTier: 'named',
    allowStoreProcessedFace: true,
  })
  assert.equal(view.media.length, 1)
  assert.equal(view.media[0].maskedUrl, 'https://x/files/uploads/desensitized/node-writeback.jpg')
  assert.equal(view.media[0].storeProcessed, false)
})

test('新政策：无打码产物不丢图，持久化原图放行且可作封面', () => {
  const albumView = {
    serviceName: '刹车保养',
    planAmount: 680,
    store: { id: 'st_1', name: '测试门店', city: '杭州' },
    storeNote: '',
    planParts: [],
    nodes: [{ id: 'stage_4', title: '配件', note: '新片', images: [] }],
    imageMeta: [
      {
        nodeId: 'stage_4',
        idx: 0,
        rawUrl: 'https://x/api/v1/media/files/uploads/2026/11/raw.jpg',
        visibility: 'public',
        publicGateStatus: 'passed',
        maskedUrl: '',
      },
    ],
  }
  const view = buildPublicView(albumView, null, { authorizationTier: 'named' })
  assert.equal(view.media.length, 1)
  assert.match(view.media[0].maskedUrl, /uploads\/2026\/11\/raw\.jpg/)
  assert.equal(view.media[0].storeProcessed, true)
  const nodes = publicViewToSnapshotNodes(view, albumView.nodes)
  assert.equal(nodes.length, 1)
  assert.equal(nodes[0].images.length, 1)
  const cover = pickPublicViewCover(view)
  assert.match(cover, /uploads\/2026\/11\/raw\.jpg/)
})

test('stage policy marks intake and plan as always private', () => {
  assert.equal(isAlwaysPrivateStage('stage_1'), true)
  assert.equal(isAlwaysPrivateStage('stage_3'), true)
  assert.equal(isAlwaysPrivateStage('stage_4'), false)
})
