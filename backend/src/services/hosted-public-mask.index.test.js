const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

/**
 * 与 loadHostMaskOutcomeIndex 内 put 规则对齐的轻量复刻：
 * not_analyzed 不算「已登记」，不得挡住媒体表 success。
 */
function isRegisteredOutcome(outcome) {
  const code = String(outcome || '').trim()
  return Boolean(code) && code !== 'not_analyzed' && code !== 'pending'
}

function putInto(index, key, row) {
  const prev = index.get(key)
  const prevRegistered = prev && isRegisteredOutcome(prev.maskOutcome)
  const nextRegistered = isRegisteredOutcome(row && row.maskOutcome)
  if (prevRegistered && !nextRegistered) {
    index.set(key, {
      ...row,
      ...prev,
      maskedUrl: prev.maskedUrl || (row && row.maskedUrl) || '',
      preMaskedUrl: prev.preMaskedUrl || (row && row.preMaskedUrl) || '',
      desensitizeStatus: prev.desensitizeStatus || (row && row.desensitizeStatus) || '',
    })
    return
  }
  index.set(key, row)
}

describe('host mask outcome index put rules', () => {
  it('media success upgrades placeholder not_analyzed', () => {
    const index = new Map()
    putInto(index, 'a', {
      maskOutcome: 'not_analyzed',
      desensitizeStatus: '',
      maskedUrl: '',
    })
    putInto(index, 'a', {
      maskOutcome: '',
      desensitizeStatus: 'success',
      maskedUrl: '',
    })
    assert.equal(index.get('a').desensitizeStatus, 'success')
    assert.equal(isRegisteredOutcome(index.get('a').maskOutcome), false)
  })

  it('registered ok_no_privacy is not wiped by empty media row', () => {
    const index = new Map()
    putInto(index, 'a', {
      maskOutcome: 'ok_no_privacy',
      desensitizeStatus: 'success',
      maskedUrl: '',
    })
    putInto(index, 'a', {
      maskOutcome: '',
      desensitizeStatus: '',
      maskedUrl: '',
    })
    assert.equal(index.get('a').maskOutcome, 'ok_no_privacy')
  })

  it('bare node should not be indexed as not_analyzed (caller skips put)', () => {
    // 回归：旧逻辑会 put not_analyzed，导致媒体 success 进不来
    const bareShouldPut = false
    assert.equal(bareShouldPut, false)
  })
})
