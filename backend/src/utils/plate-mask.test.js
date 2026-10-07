const test = require('node:test')
const assert = require('node:assert/strict')
const { maskPlate, ownerVisiblePlate } = require('./plate-mask')

test('ownerVisiblePlate prefers full plate over masked display', () => {
  assert.equal(
    ownerVisiblePlate({ plate: '浙A12345', plateDisplay: '浙A****5' }),
    '浙A12345',
  )
})

test('ownerVisiblePlate keeps unmasked display when plate field missing', () => {
  assert.equal(ownerVisiblePlate({ plateDisplay: '浙A12345' }), '浙A12345')
})

test('ownerVisiblePlate cannot invent a plate from masked-only storage', () => {
  assert.equal(ownerVisiblePlate({ plateDisplay: '浙A****5' }), '浙A****5')
})

test('maskPlate still used for public-facing display', () => {
  assert.equal(maskPlate('浙A12345'), '浙A****5')
})
