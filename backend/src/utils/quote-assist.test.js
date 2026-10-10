const test = require('node:test')
const assert = require('node:assert/strict')
const { parseQuoteAssistPayload, parseSuggestedLines } = require('./quote-assist')

test('parse suggested lines keeps names and price bands', () => {
  const lines = parseSuggestedLines([
    { name: '更换机油机滤', note: '更换机油与机滤', oem: '480-680', brand: '320-450', economy: '220-320' },
    { name: '  ' },
  ])
  assert.equal(lines.length, 1)
  assert.equal(lines[0].name, '更换机油机滤')
  assert.equal(lines[0].oem, '480-680')
  assert.equal(lines[0].economy, '220-320')
})

test('parse quote assist payload keeps lines, talking points and bands', () => {
  const got = parseQuoteAssistPayload({
    analysis: {
      summary: '主诉异响，前片偏薄。',
      omissions: ['未查后片'],
      objections: ['为什么不换盘'],
    },
    suggestedLines: [{ name: '更换前刹车片', oem: '380-520', brand: '220-320', economy: '150-220' }],
  })
  assert.equal(got.reportPrefill, '')
  assert.equal(got.summary, '')
  assert.equal(got.omissions.length, 1)
  assert.equal(got.objections.length, 1)
  assert.equal(got.suggestedLines[0].name, '更换前刹车片')
  assert.equal(got.suggestedLines[0].oem, '380-520')
})
