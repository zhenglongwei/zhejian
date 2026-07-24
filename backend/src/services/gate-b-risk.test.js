const test = require('node:test')
const assert = require('node:assert/strict')

const {
  evaluateGateBRiskSync,
  shouldSpotCheckGateB,
  GATE_B_RISK,
  normalizeSpotCheckRate,
} = require('./gate-b-risk.service')
const { PUBLIC_GATE_STATUS, VISIBILITY } = require('../constants/album-public-visibility-policy')

test('normalizeSpotCheckRate defaults and clamps', () => {
  assert.equal(normalizeSpotCheckRate(undefined), 0.1)
  assert.equal(normalizeSpotCheckRate(-1), 0.1)
  assert.equal(normalizeSpotCheckRate(0), 0)
  assert.equal(normalizeSpotCheckRate(2), 1)
  assert.equal(normalizeSpotCheckRate(0.25), 0.25)
})

test('evaluateGateBRiskSync marks accident template as high', () => {
  const result = evaluateGateBRiskSync({
    album: { id: 'alb_test', templateId: 'accident' },
    albumView: { imageMeta: [], nodes: [] },
    task: { rawAssets: [] },
  })
  assert.equal(result.risk, GATE_B_RISK.HIGH)
  assert.ok(result.reasons.includes('template_accident'))
})

test('evaluateGateBRiskSync marks elevated public media risk as high', () => {
  const result = evaluateGateBRiskSync({
    album: { id: 'alb_test2', templateId: 'brake' },
    albumView: {
      imageMeta: [
        {
          nodeId: 'n1',
          idx: 0,
          visibility: VISIBILITY.PUBLIC,
          publicGateStatus: PUBLIC_GATE_STATUS.PASSED,
        },
      ],
      nodes: [],
    },
    task: {
      rawAssets: [
        {
          nodeId: 'n1',
          idx: 0,
          riskLevel: 'medium',
          status: 'masked_ready',
        },
      ],
    },
  })
  assert.equal(result.risk, GATE_B_RISK.HIGH)
  assert.ok(result.reasons.some((r) => r.startsWith('public_media_risk')))
})

test('evaluateGateBRiskSync marks open dispute as high', () => {
  const result = evaluateGateBRiskSync({
    album: { id: 'alb_dispute', templateId: 'brake' },
    albumView: { imageMeta: [], nodes: [] },
    task: { rawAssets: [] },
    openDispute: true,
  })
  assert.equal(result.risk, GATE_B_RISK.HIGH)
  assert.ok(result.reasons.includes('open_dispute'))
})

test('evaluateGateBRiskSync returns low when no signals', () => {
  const result = evaluateGateBRiskSync({
    album: { id: 'alb_clean', templateId: 'brake' },
    albumView: { imageMeta: [], nodes: [], storeNote: '常规保养记录' },
    task: { rawAssets: [] },
  })
  assert.equal(result.risk, GATE_B_RISK.LOW)
  assert.deepEqual(result.reasons, [])
})

test('shouldSpotCheckGateB is deterministic for same key', () => {
  const a = shouldSpotCheckGateB('case_abc')
  const b = shouldSpotCheckGateB('case_abc')
  assert.equal(a, b)
})
