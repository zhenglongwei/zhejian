const test = require('node:test')
const assert = require('node:assert/strict')
const { plateResultFromViapi } = require('./aliyun')

test('viapi empty result is success, not an ocr-api error', () => {
  const result = plateResultFromViapi(
    { boxes: [], plateTextFound: false, orgWidth: 100, orgHeight: 80 },
    100,
    80,
  )
  assert.equal(result.error, '')
  assert.equal(result.authFailed, false)
  assert.equal(result.plateMaskMiss, false)
  assert.deepEqual(result.boxes, [])
})

test('viapi plate boxes are reused without falling through', () => {
  const boxes = [{ type: 'plate', left: 1, top: 2, width: 3, height: 4 }]
  const result = plateResultFromViapi({ boxes, plateTextFound: true }, 800, 600)
  assert.equal(result.error, '')
  assert.equal(result.boxes, boxes)
  assert.equal(result.plateMaskMiss, false)
})

test('viapi plate number without box is a mask miss', () => {
  const result = plateResultFromViapi(
    {
      boxes: [],
      plateTextFound: true,
      plateNumbers: ['浙A12345'],
      orgWidth: 625,
      orgHeight: 388,
    },
    625,
    388,
  )
  assert.equal(result.plateMaskMiss, true)
  assert.deepEqual(result.boxes, [])
  assert.deepEqual(result.plateNumbers, ['浙A12345'])
})
