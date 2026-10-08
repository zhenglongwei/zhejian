const test = require('node:test')
const assert = require('node:assert/strict')
const { looksLikeLicensePlate, parseViapiPlateBoxes, isAliyunFetchableImageUrl } = require('./viapi-plate')

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

test('aliyun can fetch public https but not localhost or internal oss', () => {
  assert.equal(isAliyunFetchableImageUrl('https://zhejianoss.oss-cn-hangzhou.aliyuncs.com/uploads/a.jpg'), true)
  assert.equal(isAliyunFetchableImageUrl('https://example.com/a.jpg?Expires=1'), true)
  assert.equal(isAliyunFetchableImageUrl('http://127.0.0.1:3000/a.jpg'), false)
  assert.equal(isAliyunFetchableImageUrl('https://localhost/a.jpg'), false)
  assert.equal(
    isAliyunFetchableImageUrl('https://zhejianoss.oss-cn-hangzhou-internal.aliyuncs.com/a.jpg'),
    false,
  )
  assert.equal(isAliyunFetchableImageUrl('/media/files/a.jpg'), false)
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
