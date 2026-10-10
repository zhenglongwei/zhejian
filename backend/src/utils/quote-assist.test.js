const test = require('node:test')
const assert = require('node:assert/strict')
const { parseQuoteAssistPayload, parseSuggestedLines } = require('./quote-assist')

test('parse suggested lines keeps names and drops generate-side price bands', () => {
  const lines = parseSuggestedLines([
    { name: '更换机油机滤', note: '更换机油与机滤', oem: '480-680', brand: '320-450', economy: '220-320' },
    { name: '  ' },
  ])
  assert.equal(lines.length, 1)
  assert.equal(lines[0].name, '更换机油机滤')
  assert.equal(lines[0].oem, '')
  assert.equal(lines[0].economy, '')
})

test('parse quote assist payload keeps lines and drops generate-side brief', () => {
  const got = parseQuoteAssistPayload({
    analysis: {
      summary: '主诉异响，前片偏薄。',
      reportPrefill: '前刹车片偏薄，建议更换。',
      issues: ['报价尚未填金额'],
      omissions: ['未查后片'],
      objections: ['为什么不换盘'],
    },
    suggestedLines: [{ name: '更换前刹车片', oem: '380-520', brand: '220-320', economy: '150-220' }],
  })
  assert.equal(got.reportPrefill, '')
  assert.equal(got.summary, '')
  assert.equal(got.omissions.length, 0)
  assert.equal(got.objections.length, 0)
  assert.equal(got.suggestedLines[0].name, '更换前刹车片')
  assert.equal(got.suggestedLines[0].oem, '')
})

test('accident quote assist also drops price bands', () => {
  const got = parseQuoteAssistPayload(
    {
      suggestedLines: [{ name: '前杠拆检', oem: '2000', brand: '1200', economy: '800' }],
      analysis: { omissions: ['内板未拆'] },
    },
    { category: 'accident' },
  )
  assert.equal(got.suggestedLines[0].oem, '')
  assert.equal(got.omissions.length, 0)
})
