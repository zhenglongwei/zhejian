const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { classifyHostMaskOutcome } = require('../utils/host-mask-outcome')

/**
 * 托管对账按张处理（真源：skill_node_mask_state_machine）：
 * ok_masked / ok_no_privacy 跳过；not_analyzed / llm_failed 重跑模型；
 * mask_failed 有区域只重贴、无区域回退重跑模型。
 */
function actionOf(row) {
  return classifyHostMaskOutcome(row, { nodeOnly: true }).hostAction
}

describe('host auto-mask per-image gate', () => {
  it('skips ok_masked with product', () => {
    assert.equal(
      actionOf({
        maskOutcome: 'ok_masked',
        maskSource: 'auto',
        maskedUrl: 'https://x/desensitized/a.jpg',
        maskRegions: [{ kind: 'plate', left: 0.1, top: 0.1, width: 0.2, height: 0.2 }],
      }),
      'skip',
    )
  })

  it('skips manual masked even without regions', () => {
    assert.equal(
      actionOf({
        maskOutcome: 'ok_masked',
        maskSource: 'manual',
        maskedUrl: 'https://x/desensitized/manual.jpg',
        maskRegions: [],
      }),
      'skip',
    )
  })

  it('skips ok_no_privacy', () => {
    assert.equal(actionOf({ maskOutcome: 'ok_no_privacy', maskRegions: [] }), 'skip')
  })

  it('reruns llm when node has no outcome', () => {
    assert.equal(actionOf({}), 'rerun_llm')
    assert.equal(actionOf({ maskOutcome: 'not_analyzed' }), 'rerun_llm')
    assert.equal(actionOf({ maskOutcome: 'pending' }), 'rerun_llm')
  })

  it('reruns llm for llm_failed (every reconcile)', () => {
    assert.equal(actionOf({ maskOutcome: 'llm_failed' }), 'rerun_llm')
    assert.equal(actionOf({ maskOutcome: 'call_failed' }), 'rerun_llm')
  })

  it('restamps mask_failed when regions are kept', () => {
    assert.equal(
      actionOf({
        maskOutcome: 'mask_failed',
        maskRegions: [{ kind: 'face', left: 0.2, top: 0.2, width: 0.1, height: 0.1 }],
      }),
      'restamp',
    )
    assert.equal(
      actionOf({
        maskOutcome: 'ok_detect_mask_failed',
        maskRegions: [{ kind: 'plate', left: 0.2, top: 0.2, width: 0.1, height: 0.1 }],
      }),
      'restamp',
    )
  })

  it('reruns llm for mask_failed without regions', () => {
    assert.equal(actionOf({ maskOutcome: 'mask_failed', maskRegions: [] }), 'rerun_llm')
  })

  it('downgrades ok_masked without product to mask_failed', () => {
    const classified = classifyHostMaskOutcome(
      { maskOutcome: 'ok_masked', maskedUrl: '', maskRegions: [] },
      { nodeOnly: true },
    )
    assert.equal(classified.outcome, 'mask_failed')
    assert.equal(classified.hostAction, 'rerun_llm')
  })
})
