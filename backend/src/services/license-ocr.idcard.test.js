const test = require('node:test')
const assert = require('node:assert/strict')
const { mapIdCardOcrResult } = require('./license-ocr.service')

test('id card ocr maps face name and back period', () => {
  const face = mapIdCardOcrResult({
    face: { data: { name: '张三' } },
    back: { data: { issueAuthority: '某分局', validPeriod: '2010.01.01-2030.01.01' } },
  })
  assert.equal(face.name, '张三')
  assert.equal(face.side, 'face')

  const backOnly = mapIdCardOcrResult({
    data: { issueAuthority: '某分局' },
  })
  assert.equal(backOnly.side, 'back')
})
