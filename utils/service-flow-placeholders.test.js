const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveFlowCategory, getFlowPlaceholders } = require('./service-flow-placeholders')
const { buildQuoteLinesFromFindings } = require('./service-flow-docs')

test('paint template uses body-paint placeholders, not battery copy', () => {
  assert.equal(resolveFlowCategory('paint', ''), 'body_paint')
  const row = getFlowPlaceholders('paint', '钣喷修复')
  assert.match(row.chiefComplaint, /刮擦|补漆|划痕/)
  assert.doesNotMatch(row.chiefComplaint, /亏电/)
  assert.match(row.findingAdvice, /划痕|漆膜/)
  assert.match(row.quoteNote, /补漆|喷/)
})

test('battery template keeps battery complaint example', () => {
  const row = getFlowPlaceholders('battery', '电瓶更换')
  assert.match(row.chiefComplaint, /亏电|打不着/)
})

test('quote prefill copies part name only', () => {
  const lines = buildQuoteLinesFromFindings([
    { partName: '右前门', result: '需处理', advice: '中度划痕，漆膜已破', url: 'https://example.com/a.jpg' },
    { partName: '机油', result: '状态良好', advice: '无需处理', url: 'https://example.com/b.jpg' },
  ])
  assert.equal(lines.length, 1)
  assert.equal(lines[0].name, '右前门')
  assert.equal(lines[0].note, '')
})
