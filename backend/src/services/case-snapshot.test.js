const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeCaseSnapshot,
  extractSnapshotFromContentJson,
  resolveSnapshotVersion,
  resolvePublicCaseContentNodes,
} = require('../schemas/case-snapshot.schema')
const { buildCaseSnapshot } = require('./case-snapshot.service')
const { buildCaseDraft, buildNodesFromTask } = require('./public-case.service')
const { buildCaseArticlePayload } = require('./case-article-generator.service')
const {
  isAlbumContentLocked,
  ALBUM_CONTENT_LOCKED_MESSAGE,
} = require('./service-album.service')

test('normalizeCaseSnapshot rejects invalid version', () => {
  assert.equal(normalizeCaseSnapshot(null), null)
  assert.equal(normalizeCaseSnapshot({ version: 0 }), null)
})

test('normalizeCaseSnapshot preserves nodes and price', () => {
  const raw = {
    version: 1,
    frozenAt: '2026-07-08T12:00:00.000Z',
    authorizationTier: 'named',
    title: '杭州宝马 · 钣金喷漆',
    summary: '摘要',
    articleBody: '正文',
    coverImage: '/media/files/uploads/desensitized/cover.jpg',
    nodes: [{ id: 'stage_1', title: '接车', images: ['/media/a.jpg'] }],
    price: { priceMode: 'fixed', minAmount: 1000, maxAmount: 2000 },
  }
  const snap = normalizeCaseSnapshot(raw)
  assert.equal(snap.version, 1)
  assert.equal(snap.title, '杭州宝马 · 钣金喷漆')
  assert.equal(snap.nodes.length, 1)
  assert.equal(snap.price.minAmount, 1000)
})

test('extractSnapshotFromContentJson and resolveSnapshotVersion', () => {
  const contentJson = {
    nodes: [],
    snapshot: { version: 2, frozenAt: '2026-07-08T12:00:00.000Z', title: 't' },
  }
  assert.equal(resolveSnapshotVersion(contentJson), 2)
  assert.equal(extractSnapshotFromContentJson({}), null)
})

test('resolvePublicCaseContentNodes prefers snapshot over stale contentJson.nodes', () => {
  const contentJson = {
    nodes: [{ id: 'live', title: '相册已改', images: ['/media/raw/live.jpg'] }],
    snapshot: {
      version: 1,
      frozenAt: '2026-07-08T12:00:00.000Z',
      nodes: [{ id: 'snap', title: '授权瞬间', images: ['/media/files/uploads/desensitized/frozen.jpg'] }],
    },
  }
  const nodes = resolvePublicCaseContentNodes(contentJson)
  assert.equal(nodes.length, 1)
  assert.equal(nodes[0].title, '授权瞬间')
  assert.equal(nodes[0].images[0], '/media/files/uploads/desensitized/frozen.jpg')
})

test('resolvePublicCaseContentNodes falls back to contentJson.nodes without snapshot', () => {
  const contentJson = {
    nodes: [{ id: 'legacy', title: '存量', images: [] }],
  }
  const nodes = resolvePublicCaseContentNodes(contentJson)
  assert.equal(nodes[0].id, 'legacy')
})

test('mapPublicCaseRow uses snapshot nodes not live album drift', () => {
  const { mapPublicCaseRow } = require('./content.service')
  const row = {
    id: 'case_test',
    albumId: 'alb_test',
    authorizationTier: 'named',
    title: '测试案例',
    summary: '摘要',
    coverImage: '/media/files/uploads/desensitized/cover.jpg',
    serviceName: '钣金',
    storeId: 'store_1',
    storeName: '门店',
    city: '杭州',
    minAmount: 1000,
    maxAmount: 2000,
    priceMode: 'range',
    contentJson: {
      nodes: [{ id: 'stale', title: '旧 nodes', images: [] }],
      snapshot: {
        version: 1,
        frozenAt: '2026-07-08T12:00:00.000Z',
        nodes: [
          {
            id: 'frozen',
            title: '快照节点',
            note: '冻结',
            images: ['/media/files/uploads/desensitized/a.jpg'],
          },
        ],
      },
      vehicleText: '宝马（已脱敏）',
      tags: ['authorized'],
    },
  }
  const liveAlbum = {
    nodes: [{ id: 'live', title: '相册已改', images: [{ rawUrl: '/media/raw/x.jpg' }] }],
  }
  const mapped = mapPublicCaseRow(row, liveAlbum)
  assert.equal(mapped.nodes.length, 1)
  assert.equal(mapped.nodes[0].title, '快照节点')
  assert.equal(mapped.nodes[0].images[0], '/media/files/uploads/desensitized/a.jpg')
})

test('buildCaseSnapshot writes frozen snapshot with articleBody', () => {
  const albumView = {
    albumId: 'alb_test_01',
    status: 'completed',
    serviceName: '钣金喷漆',
    storeNote: '门店备注',
    vehicle: { brand: '宝马', series: '3系' },
    store: { id: 'store_1', name: '演示门店', city: '杭州' },
    nodes: [
      { id: 'stage_1', stage: 'intake', title: '接车记录', note: '到店', images: [] },
    ],
    planParts: [],
    evidenceItems: [],
  }
  const task = {
    taskId: 'task_pre_alb_test_01',
    assets: [
      {
        nodeId: 'stage_1',
        idx: 0,
        maskedUrl: '/media/files/uploads/desensitized/a.jpg',
      },
    ],
  }
  const nodesWithMask = buildNodesFromTask(albumView.nodes, task)
  const draft = buildCaseDraft(albumView, task, 'named', {
    serviceItemId: 'svc_1',
    templateId: 'tpl_default',
  })
  const articlePayload = buildCaseArticlePayload({
    caseId: draft.id,
    draft: { ...draft, contentJson: { ...draft.contentJson, nodes: nodesWithMask } },
    albumView: { ...albumView, nodes: nodesWithMask },
    coldStart: false,
    hasUserAuthorization: true,
    previousArticleVersion: 0,
  })

  const { snapshot, contentJson } = buildCaseSnapshot({
    albumView,
    draft,
    articlePayload,
    nodesWithMask,
    task,
    authorizationTier: 'named',
    previousSnapshotVersion: 0,
    parts: [{ id: 'part_1', name: '前杠' }],
    serviceItemId: 'svc_1',
    templateId: 'tpl_default',
  })

  assert.equal(snapshot.version, 1)
  assert.ok(snapshot.frozenAt)
  assert.equal(snapshot.authorizationTier, 'named')
  assert.equal(snapshot.taskId, 'task_pre_alb_test_01')
  assert.ok(snapshot.articleBody.length > 0)
  assert.deepEqual(snapshot.nodes[0].images, ['/media/files/uploads/desensitized/a.jpg'])
  assert.equal(contentJson.snapshot.version, 1)
  assert.deepEqual(contentJson.nodes, nodesWithMask)
  assert.equal(snapshot.parts.length, 1)
})

test('buildCaseSnapshot increments snapshotVersion on re-authorization', () => {
  const albumView = {
    albumId: 'alb_test_02',
    status: 'completed',
    serviceName: '钣金喷漆',
    vehicle: { brand: '奥迪' },
    store: { id: 'store_1', name: '演示门店', city: '杭州' },
    nodes: [{ id: 'stage_1', title: '接车', images: [] }],
  }
  const draft = buildCaseDraft(albumView, null, 'named')
  const articlePayload = buildCaseArticlePayload({
    caseId: draft.id,
    draft,
    albumView,
    previousArticleVersion: 1,
  })
  const { snapshot } = buildCaseSnapshot({
    albumView,
    draft,
    articlePayload,
    nodesWithMask: albumView.nodes,
    authorizationTier: 'named',
    previousSnapshotVersion: 1,
  })
  assert.equal(snapshot.version, 2)
})

test('isAlbumContentLocked when authorization is authorized', () => {
  assert.equal(isAlbumContentLocked({ authorization: { status: 'authorized' } }), true)
  assert.equal(isAlbumContentLocked({ authorization: { status: 'user_rejected' } }), false)
  assert.equal(isAlbumContentLocked({}), false)
  assert.equal(
    isAlbumContentLocked({ complianceStatus: 'passed' }),
    true
  )
  assert.equal(ALBUM_CONTENT_LOCKED_MESSAGE.includes('撤回'), true)
})
