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

test('parseViapiPlateBoxes uses PascalCase Positions', () => {
  const parsed = parseViapiPlateBoxes({
    Plates: [
      {
        PlateNumber: '浙A12345',
        Positions: [
          { X: 100, Y: 200 },
          { X: 220, Y: 200 },
          { X: 220, Y: 240 },
          { X: 100, Y: 240 },
        ],
      },
    ],
  }, 800, 600)
  assert.equal(parsed.boxes.length, 1)
  assert.equal(parsed.boxes[0].left, 100)
  assert.equal(parsed.boxes[0].width, 120)
})

test('parseViapiPlateBoxes uses Roi Left/Top/Width/Height', () => {
  const parsed = parseViapiPlateBoxes({
    plates: [
      {
        plateNumber: '京B88888',
        Roi: { Left: 10, Top: 20, Width: 80, Height: 24 },
      },
    ],
  })
  assert.equal(parsed.boxes.length, 1)
  assert.equal(parsed.boxes[0].left, 10)
  assert.equal(parsed.boxes[0].top, 20)
  assert.equal(parsed.boxes[0].width, 80)
})

test('parseViapiPlateBoxes prefers a plate that has geometry over higher-confidence text-only', () => {
  const parsed = parseViapiPlateBoxes({
    plates: [
      { plateNumber: '浙A11111', confidence: 99 },
      {
        plateNumber: '浙A22222',
        confidence: 80,
        positions: [
          { x: 40, y: 50 },
          { x: 120, y: 50 },
          { x: 120, y: 80 },
          { x: 40, y: 80 },
        ],
      },
    ],
  })
  assert.equal(parsed.boxes.length, 1)
  assert.equal(parsed.boxes[0].left, 40)
  assert.deepEqual(parsed.plateNumbers, ['浙A11111', '浙A22222'])
})

test('parseViapiPlateBoxes accepts Positions as JSON string or flat numbers', () => {
  const asString = parseViapiPlateBoxes({
    plates: [
      {
        plateNumber: '沪C33333',
        Positions: JSON.stringify([
          { x: 1, y: 2 },
          { x: 11, y: 2 },
          { x: 11, y: 12 },
          { x: 1, y: 12 },
        ]),
      },
    ],
  })
  assert.equal(asString.boxes[0].width, 10)
  const asFlat = parseViapiPlateBoxes({
    plates: [
      {
        plateNumber: '沪C33333',
        positions: [1, 2, 11, 2, 11, 12, 1, 12],
      },
    ],
  })
  assert.equal(asFlat.boxes[0].height, 10)
})

test('parseViapiPlateBoxes keeps empty boxes when only plate text is present', () => {
  const parsed = parseViapiPlateBoxes({
    plates: [{ plateNumber: '粤B12345', confidence: 90 }],
  })
  assert.deepEqual(parsed.boxes, [])
  assert.deepEqual(parsed.plateNumbers, ['粤B12345'])
})
