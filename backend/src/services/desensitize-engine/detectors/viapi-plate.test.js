const test = require('node:test')
const assert = require('node:assert/strict')
const { looksLikeLicensePlate, parseViapiPlateBoxes } = require('./viapi-plate')

test('rejects overlay and short tokens that are not plates', () => {
  assert.equal(looksLikeLicensePlate('REC'), false)
  assert.equal(looksLikeLicensePlate('2'), false)
  assert.equal(looksLikeLicensePlate(''), false)
  assert.equal(looksLikeLicensePlate('LIVE'), false)
})

test('accepts mainland plate-like numbers', () => {
  assert.equal(looksLikeLicensePlate('浙ED099B'), true)
  assert.equal(looksLikeLicensePlate('京A12345'), true)
})

test('parseViapiPlateBoxes drops REC overlay as no plate', () => {
  const parsed = parseViapiPlateBoxes({
    plates: [
      {
        plateNumber: 'REC',
        roi: { x: 835, y: 268, w: 114, h: 39 },
        positions: [
          { x: 835, y: 268 },
          { x: 949, y: 268 },
          { x: 949, y: 307 },
          { x: 835, y: 307 },
        ],
      },
    ],
  }, 1080, 1920)
  assert.deepEqual(parsed.boxes, [])
  assert.deepEqual(parsed.plateNumbers, [])
})
