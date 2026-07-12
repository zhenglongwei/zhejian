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
  assert.equal(meta.evidenceLevel, 'partial_images')
  assert.equal(meta.publicImageCount, 2)
  assert.match(meta.trustStatement, /用户授权案例/)
  assert.ok(normalizeCaseTrustMeta(meta))
})

test('formatTrustStatement includes version', () => {
  const text = formatTrustStatement({
    authorizationTierLabel: '用户授权案例',
    snapshotVersion: 3,
    reviewedAt: '2026-03-16T08:00:00.000Z',
    evidenceLevelLabel: '含少量脱敏过程图',
  })
  assert.match(text, /v3/)
})
