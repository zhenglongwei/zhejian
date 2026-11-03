const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { classifyHostMaskOutcome, hostMaskAction } = require('../utils/host-mask-outcome')

/**
 * 与 runAutoMask 托管分支同一套「要不要再打」判定：
 * 已成功跳过；未跑大模型/模型失败/贴码失败才处理。
 */
function shouldProcessHostAsset(asset) {
  if (!asset) return false
  const classified = classifyHostMaskOutcome(asset)
  return hostMaskAction(classified.outcome) !== 'skip'
}

describe('host auto-mask per-image gate', () => {
  it('skips ok_masked with product', () => {
    assert.equal(
      shouldProcessHostAsset({
        status: 'masked_ready',
        maskedUrl: 'https://x/desensitized/a.jpg',
        riskTags: ['plate'],
      }),
      false,
    )
  })

  it('skips ok_no_privacy settled without product', () => {
    assert.equal(
      shouldProcessHostAsset({
        status: 'masked_ready',
        maskedUrl: '',
        riskTags: [],
      }),
      false,
    )
  })

  it('processes not_analyzed / raw upload', () => {
    assert.equal(
      shouldProcessHostAsset({
        status: 'raw_uploaded',
        maskedUrl: '',
        riskTags: [],
      }),
      true,
    )
    assert.equal(
      shouldProcessHostAsset({ maskOutcome: 'not_analyzed' }),
      true,
    )
  })

  it('skips registered mask_failed / need_manual on re-host', () => {
    assert.equal(
      shouldProcessHostAsset({
        status: 'mask_failed',
        maskedUrl: '',
        riskTags: ['face'],
        needManual: true,
      }),
      false,
    )
  })

  it('skips registered llm_failed on re-host', () => {
    assert.equal(shouldProcessHostAsset({ maskOutcome: 'llm_failed' }), false)
  })

  it('skips explicit ok_no_privacy', () => {
    assert.equal(shouldProcessHostAsset({ maskOutcome: 'ok_no_privacy' }), false)
  })
})
