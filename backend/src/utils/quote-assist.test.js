const test = require('node:test')
const assert = require('node:assert/strict')
const { parseQuoteAssistPayload, parseSuggestedLines } = require('./quote-assist')

test('parse suggested lines keeps intervals and drops empty names', () => {
  const lines = parseSuggestedLines([
    { name: '更换机油机滤', note: '更换机油与机滤', oem: '480-680', brand: '320-450', economy: '220-320' },
    { name: '  ' },
  ])
  assert.equal(lines.length, 1)
  assert.equal(lines[0].name, '更换机油机滤')
  assert.equal(lines[0].economy, '220-320')
})

test('parse quote assist payload reads analysis and omissions', () => {
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
  assert.match(got.reportPrefill, /前刹车片/)
  assert.equal(got.omissions[0], '未查后片')
  assert.equal(got.suggestedLines[0].name, '更换前刹车片')
})

test('teardown quote lines have no price bands', () => {
  const lines = parseSuggestedLines([
    { name: '拆检', oem: '100-200', brand: '80-120', economy: '50-100' },
    { name: '更换机油滤芯', oem: '80-150', economy: '30-60' },
  ])
  assert.equal(lines[0].oem, '')
  assert.equal(lines[1].oem, '80-150')
})

test('accident quote assist strips price bands', () => {
  const got = parseQuoteAssistPayload(
    {
      suggestedLines: [{ name: '前杠拆检', oem: '2000', brand: '1200', economy: '800' }],
      analysis: { omissions: ['内板未拆'] },
    },
    { category: 'accident' },
  )
  assert.equal(got.suggestedLines[0].oem, '')
  assert.equal(got.omissions[0], '内板未拆')
})
