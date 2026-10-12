const test = require('node:test')
const assert = require('node:assert/strict')
const { parsePhotoAdvice, normalizeRequest } = require('./merchant-photo-advice.service')

test('识图结果只留三句', () => {
  const lines = parsePhotoAdvice('{"lines":["补接待区","门头招牌被挡住","工位太暗","多余"]}')
  assert.deepEqual(lines, ['补接待区', '门头招牌被挡住', '工位太暗'])
})

test('只收下能打开的照片地址', () => {
  const payload = normalizeRequest({
    missing: ['接待区', '执照'],
    images: [
      { slot: 'facade', url: 'https://cdn.example/a.jpg', width: 400, height: 300 },
      { slot: 'workshop', url: 'wxfile://tmp' },
    ],
  })
  assert.deepEqual(payload.missing, ['接待区'])
  assert.equal(payload.images.length, 1)
  assert.equal(payload.images[0].slot, '门头')
  assert.equal(payload.images[0].width, 400)
})
