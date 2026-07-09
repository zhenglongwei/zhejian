const test = require('node:test')
const assert = require('node:assert/strict')

const {
  resolveCaseGeoEditPolicy,
  assertSnapshotPayloadForbidden,
  hasFrozenCaseSnapshot,
  SNAPSHOT_FROZEN_CODE,
} = require('../constants/case-enrichment')
const { buildEnrichmentRegeneratePayload } = require('./admin-case-article.service')

const FROZEN_CONTENT = {
  nodes: [{ id: 'live', title: '相册已改', images: [] }],
  snapshot: {
    version: 1,
    frozenAt: '2026-07-08T12:00:00.000Z',
    title: '快照标题',
    summary: '快照摘要',
    articleBody: '快照正文',
    nodes: [{ id: 'snap', title: '授权节点', images: ['/media/d.jpg'] }],
    geo: {
      faultDesc: '快照故障',
      inspectResult: '快照检测',
      repairPlan: '快照方案',
      resultConfirm: '快照确认',
    },
    serviceName: '钣金',
    city: '杭州',
    storeId: 'store_1',
    storeName: '演示门店',
    vehicle: { brand: '宝马' },
  },
  geo: {
    faultDesc: '快照故障',
    manualFields: ['seoTitle'],
  },
}

test('resolveCaseGeoEditPolicy switches to enrichment-only when snapshot exists', () => {
  const legacy = resolveCaseGeoEditPolicy({ nodes: [] })
  assert.equal(legacy.frozen, false)
  assert.ok(legacy.topFields.includes('articleBody'))
  assert.ok(legacy.blockFields.includes('faultDesc'))

  const frozen = resolveCaseGeoEditPolicy(FROZEN_CONTENT)
  assert.equal(frozen.frozen, true)
  assert.deepEqual(frozen.topFields, ['aiSummary', 'seoTitle', 'seoDescription'])
  assert.deepEqual(frozen.blockFields, [])
})

test('assertSnapshotPayloadForbidden rejects snapshot body fields', () => {
  assert.throws(
    () =>
      assertSnapshotPayloadForbidden({ faultDesc: '改故障' }, { frozen: true }),
    (err) => err.code === SNAPSHOT_FROZEN_CODE
  )
  assert.throws(
    () =>
      assertSnapshotPayloadForbidden({ articleBody: '改正文' }, { frozen: true }),
    (err) => err.code === SNAPSHOT_FROZEN_CODE
  )
  assert.throws(
    () =>
      assertSnapshotPayloadForbidden(
        { contentJson: { snapshot: { version: 2 } } },
        { frozen: true }
      ),
    (err) => err.code === SNAPSHOT_FROZEN_CODE
  )
  assert.doesNotThrow(() =>
    assertSnapshotPayloadForbidden({ aiSummary: '新摘要', seoTitle: 'SEO' }, { frozen: true })
  )
})

test('hasFrozenCaseSnapshot detects snapshot version', () => {
  assert.equal(hasFrozenCaseSnapshot(FROZEN_CONTENT), true)
  assert.equal(hasFrozenCaseSnapshot({ nodes: [] }), false)
})

test('buildEnrichmentRegeneratePayload preserves snapshot title/body/nodes', () => {
  const row = {
    id: 'case_test',
    title: '行标题',
    summary: '行摘要',
    articleBody: '行正文',
    seoTitle: '手改 SEO',
    seoDescription: '手改描述',
    aiSummary: '手改摘要',
    articleVersion: 2,
    slug: 'hangzhou-bmw-case',
    canonicalPath: '/cases/hangzhou-bmw-case',
    contentJson: FROZEN_CONTENT,
  }

  const payload = buildEnrichmentRegeneratePayload(row, FROZEN_CONTENT.snapshot, FROZEN_CONTENT)

  assert.equal(payload.title, '行标题')
  assert.equal(payload.articleBody, '行正文')
  assert.equal(payload.contentJson.snapshot.version, 1)
  assert.equal(payload.contentJson.snapshot.title, '快照标题')
  assert.equal(payload.contentJson.nodes[0].id, 'live')
  assert.equal(payload.contentJson.snapshot.nodes[0].title, '授权节点')
  assert.equal(payload.contentJson.geo.faultDesc, '快照故障')
  assert.equal(payload.seoTitle, '手改 SEO')
  assert.equal(payload.articleVersion, 3)
  assert.ok(payload.aiSummary)
})
