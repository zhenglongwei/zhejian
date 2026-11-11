const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeCaseTrustMeta,
  mapAuthorizationTierForTrust,
  resolveEvidenceLevel,
  formatTrustStatement,
} = require('../schemas/case-trust-meta.schema')
const { buildCaseTrustMeta } = require('./case-trust-meta.service')

test('mapAuthorizationTierForTrust maps private to merchant_history', () => {
  const mapped = mapAuthorizationTierForTrust('private')
  assert.equal(mapped.authorizationTier, 'merchant_history')
  assert.equal(mapped.authorizationTierLabel, '商家历史案例')
})

test('resolveEvidenceLevel thresholds', () => {
  assert.equal(resolveEvidenceLevel(0).evidenceLevel, 'text_primary')
  assert.equal(resolveEvidenceLevel(2).evidenceLevel, 'partial_images')
  assert.equal(resolveEvidenceLevel(5).evidenceLevel, 'rich_images')
})

test('buildCaseTrustMeta from snapshot row', () => {
  const row = {
    id: 'case_test',
    albumId: 'alb_test',
    authorizationTier: 'named',
    publishedAt: new Date('2026-03-16T08:00:00.000Z'),
    contentJson: {
      snapshot: {
        version: 2,
        frozenAt: '2026-03-15T10:00:00.000Z',
        authorizationTier: 'named',
        publicView: {
          version: 1,
          publicMediaCount: 2,
          media: [{ maskedUrl: '/a.jpg' }, { maskedUrl: '/b.jpg' }],
          facts: {},
        },
        nodes: [
          { id: 'stage_1', note: '异响', images: ['/a.jpg'] },
          { id: 'stage_2', note: '片磨损', images: [] },
        ],
      },
    },
  }
  const meta = buildCaseTrustMeta({
    row,
    album: { complianceStatus: 'passed' },
    reviewedAt: '2026-03-16T08:00:00.000Z',
  })
  assert.ok(meta)
  assert.equal(meta.snapshotVersion, 2)
  assert.equal(meta.authorizationTier, 'user_authorized')
  assert.equal(meta.authorizationTierLabel, '已发布')
  assert.equal(meta.evidenceLevel, 'partial_images')
  assert.equal(meta.publicImageCount, 2)
  assert.match(meta.trustStatement, /已发布/)
  assert.ok(normalizeCaseTrustMeta(meta))
})

test('formatTrustStatement includes version', () => {
  const text = formatTrustStatement({
    authorizationTierLabel: '已发布',
    snapshotVersion: 3,
    reviewedAt: '2026-03-16T08:00:00.000Z',
    evidenceLevelLabel: '含少量脱敏过程图',
  })
  assert.match(text, /v3/)
})

test('buildCaseTrustMeta 按单据链画像升级证据分级', () => {
  const row = {
    id: 'case_profile',
    albumId: 'alb_profile',
    authorizationTier: 'named',
    publishedAt: new Date('2026-11-11T08:00:00.000Z'),
    contentJson: {
      snapshot: {
        version: 2,
        frozenAt: '2026-11-10T10:00:00.000Z',
        authorizationTier: 'named',
        publicView: { version: 1, publicMediaCount: 2, media: [{ maskedUrl: '/a.jpg' }], facts: {} },
        nodes: [{ id: 'stage_1', note: '划痕', images: ['/a.jpg'] }],
      },
    },
  }
  const album = {
    complianceStatus: 'passed',
    contentPackageJson: {
      flowNodes: [
        { id: 'n1', kind: 'intake_inspection', document: { status: 'confirmed', payload: { chiefComplaint: '右前门划痕' } } },
        { id: 'n2', kind: 'inspection_report', document: { status: 'confirmed', payload: { findings: [{ partName: '右前门漆面', result: '需处理', advice: '补漆', images: [{ url: '/i.jpg' }] }] } } },
        { id: 'n3', kind: 'quote_confirm', document: { status: 'confirmed', payload: { lines: [{ name: '右前门补漆' }] } } },
        { id: 'n4', kind: 'work', photoDraft: { findings: [{ partName: '右前门', url: '/w1.jpg' }] }, document: { status: 'confirmed', payload: { workItems: [{ partName: '右前门补漆' }] } } },
        { id: 'n5', kind: 'repair_report', document: { status: 'confirmed', payload: { conclusion: '完成', warrantyPeriod: '3个月', acceptanceItems: [{ id: 'acc_1', kind: 'work', name: '补漆', result: 'pass', images: [{ url: '/a1.jpg' }, { url: '/a2.jpg' }] }] } } },
      ],
    },
  }
  const meta = buildCaseTrustMeta({
    row,
    album,
    reviewedAt: '2026-11-11T08:00:00.000Z',
  })
  assert.ok(meta)
  // 快照只有 2 张公开图（旧口径会是 partial_images），但单据链五环定稿 + 图证多环节 → 图文全留证
  assert.equal(meta.evidenceLevel, 'rich_images')
  assert.equal(meta.evidenceLevelLabel, '图文全留证')
  assert.match(meta.trustStatement, /图文全留证/)
})

test('resolveAlbumFlowNodes 托管快照优先，回落相册链', () => {
  const { resolveAlbumFlowNodes } = require('./case-trust-meta.service')
  const flowNodes = [{ id: 'n1', kind: 'intake' }]
  assert.equal(
    resolveAlbumFlowNodes({ contentPackageJson: { flowNodes } }),
    flowNodes
  )
  const archiveNodes = [{ id: 'n2', kind: 'work' }]
  assert.equal(
    resolveAlbumFlowNodes({
      contentPackageJson: { hostMeta: { archiveSnapshot: { flowNodes: archiveNodes } } },
    }),
    archiveNodes
  )
  assert.deepEqual(resolveAlbumFlowNodes({}), [])
})

test('mapAuthorizationTierForTrust maps merchant_published', () => {
  const mapped = mapAuthorizationTierForTrust('merchant_published')
  assert.equal(mapped.authorizationTier, 'merchant_published')
  assert.equal(mapped.authorizationTierLabel, '门店发布')
})
