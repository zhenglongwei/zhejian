const test = require('node:test')
const assert = require('node:assert/strict')
const { assessCopyQuality, COPY_QUALITY_LEVEL } = require('./copy-quality.service')

test('copy quality blocks PII in note', () => {
  const result = assessCopyQuality({
    serviceName: '保养',
    planAmount: 300,
    nodes: [{ id: 'stage_2', title: '检测', note: '联系13812345678' }],
    imageMeta: [],
  })
  assert.equal(result.level, COPY_QUALITY_LEVEL.BLOCK)
  assert.ok(result.suggestions.some((s) => s.issue === 'pii_in_note'))
})

test('copy quality warns when quote image but no plan text', () => {
  const result = assessCopyQuality({
    serviceName: '保养',
    nodes: [{ id: 'stage_3', title: '方案', note: '' }],
    imageMeta: [{ nodeId: 'stage_3', idx: 0, visibility: 'private', publicGateStatus: 'skipped' }],
  })
  assert.ok(result.suggestions.some((s) => s.issue === 'plan_text_missing'))
})

test('copy quality warns when no public media', () => {
  const result = assessCopyQuality({
    serviceName: '保养',
    planAmount: 500,
    nodes: [{ id: 'stage_3', note: '更换机油' }],
    imageMeta: [{ nodeId: 'stage_1', idx: 0, visibility: 'private', publicGateStatus: 'skipped' }],
  })
  assert.ok(result.suggestions.some((s) => s.issue === 'no_public_media'))
})
