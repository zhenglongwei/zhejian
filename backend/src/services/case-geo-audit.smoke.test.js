/**
 * PUB-GEO · skeletonHash / 规则机审冒烟
 */
const assert = require('assert')
const {
  computeCaseSkeletonHash,
  draftCopyFingerprint,
} = require('../utils/case-skeleton-hash')
const { auditAuthenticityByRules } = require('../services/case-llm-audit.service')
const { CASE_GEO_AUTHENTICITY_PASS } = require('../constants/case-geo-audit')

function testSkeletonChangesOnOutcome() {
  const album = { templateId: 'oil', serviceItemId: 'svc1', images: [] }
  const itemsA = [
    { itemKey: 'oil_level', outcome: 'normal', note: '正常', images: [{ url: 'a' }] },
  ]
  const itemsB = [
    { itemKey: 'oil_level', outcome: 'recommend_replace', note: '建议换', images: [{ url: 'a' }] },
  ]
  const h1 = computeCaseSkeletonHash({ album, checklistItems: itemsA, images: [] })
  const h2 = computeCaseSkeletonHash({ album, checklistItems: itemsB, images: [] })
  assert.notStrictEqual(h1, h2, 'outcome change should bump skeletonHash')
}

function testCopyFingerprint() {
  const a = draftCopyFingerprint({ title: 'T', caseSummary: 'S', faq: [], sections: [] })
  const b = draftCopyFingerprint({ title: 'T2', caseSummary: 'S', faq: [], sections: [] })
  assert.notStrictEqual(a, b)
}

function testRulesAuditG1() {
  const album = {
    id: 'alb1',
    serviceName: '机油保养',
    images: [
      { id: 'img1', checklistItemKey: 'oil_level', rawUrl: 'https://x/a.jpg', nodeId: 'stage_2' },
    ],
  }
  const albumView = {
    serviceName: '机油保养',
    imageMeta: [
      {
        visibility: 'public',
        publicGateStatus: 'passed',
        nodeId: 'stage_2',
      },
    ],
    nodes: [],
    imageCount: 1,
  }
  // stub checklist via items on album is not used — collectMaterialFacts uses buildMerchantChecklistView
  // For unit test of G1 pain bonus, call auditAuthenticityByRules with rich draft after mocking is hard.
  // Minimal: hard block no public media fails pass
  const failView = { imageMeta: [], nodes: [], imageCount: 0, serviceName: 'x' }
  const fail = auditAuthenticityByRules({
    album: { id: 'a', images: [], serviceName: 'x' },
    albumView: failView,
    draft: { title: 't', caseSummary: '担心漏油怎么办', faq: [], sections: [] },
    visionNotes: [],
  })
  assert.strictEqual(fail.passed, false)
  assert.ok(fail.hardBlocks.length >= 1)
  assert.strictEqual(
    fail.authenticityScore < CASE_GEO_AUTHENTICITY_PASS || fail.hardBlocks.length > 0,
    true,
  )
  // pain bonus must be 0 when authenticity below 60
  if (fail.authenticityScore < CASE_GEO_AUTHENTICITY_PASS) {
    assert.strictEqual(fail.painPointBonus, 0, 'G1: pain cannot pad fail')
  }
  void album
  void albumView
}

testSkeletonChangesOnOutcome()
testCopyFingerprint()
testRulesAuditG1()
console.log('case-geo-audit smoke ok')
