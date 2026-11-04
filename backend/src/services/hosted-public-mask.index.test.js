const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { classifyHostMaskOutcome } = require('../utils/host-mask-outcome')

/**
 * 托管对账只读节点：任务行/媒体表不再参与结论。
 * 回归点：媒体表 success 曾把节点「未分析」洗成无须打码，导致托管整本跳过。
 */
function classifyNode(row) {
  return classifyHostMaskOutcome(row, { nodeOnly: true })
}

describe('host mask outcome: node only', () => {
  it('media success does not settle a node without outcome', () => {
    const classified = classifyNode({ desensitizeStatus: 'success', riskTags: [] })
    assert.equal(classified.outcome, 'not_analyzed')
    assert.equal(classified.hostAction, 'rerun_llm')
  })

  it('media success does not override node llm_failed', () => {
    const classified = classifyNode({
      desensitizeStatus: 'success',
      maskOutcome: 'llm_failed',
    })
    assert.equal(classified.outcome, 'llm_failed')
    assert.equal(classified.hostAction, 'rerun_llm')
  })

  it('node ok_no_privacy is authoritative', () => {
    const classified = classifyNode({ maskOutcome: 'ok_no_privacy', maskRegions: [] })
    assert.equal(classified.outcome, 'ok_no_privacy')
    assert.equal(classified.hostAction, 'skip')
  })

  it('node ok_masked requires a product url', () => {
    assert.equal(
      classifyNode({ maskOutcome: 'ok_masked', maskedUrl: 'https://x/d.jpg' }).outcome,
      'ok_masked',
    )
    assert.equal(classifyNode({ maskOutcome: 'ok_masked', maskedUrl: '' }).outcome, 'mask_failed')
  })
})
