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

  const viapiBack = mapIdCardOcrResult({
    data: { issue: '某分局', startDate: '20100101', endDate: '20300101' },
  })
  assert.equal(viapiBack.side, 'back')
  assert.equal(viapiBack.issueAuthority, '某分局')

  const viapiFrontResult = mapIdCardOcrResult({
    frontResult: { name: '李四', IDNumber: '110101199001011234' },
  })
  assert.equal(viapiFrontResult.name, '李四')
  assert.equal(viapiFrontResult.side, 'face')

  const viapiBackResult = mapIdCardOcrResult({
    backResult: { issue: '某分局', startDate: '20100101', endDate: '20300101' },
  })
  assert.equal(viapiBackResult.side, 'back')
  assert.equal(viapiBackResult.issueAuthority, '某分局')
  assert.equal(viapiBackResult.validPeriod, '20100101-20300101')

  const viapiPascal = mapIdCardOcrResult({
    Data: {
      FrontResult: { Name: '王五', IDNumber: '110101199001011234' },
      BackResult: { Issue: '某分局', StartDate: '20100101', EndDate: '20300101' },
    },
  })
  assert.equal(viapiPascal.name, '王五')
  assert.equal(viapiPascal.side, 'face')
  assert.equal(viapiPascal.issueAuthority, '某分局')
})
