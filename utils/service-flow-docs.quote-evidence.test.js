const test = require('node:test')
const assert = require('node:assert/strict')
const {
  FINDING_RESULT,
  ownerFindingResultLabel,
  findingAdviceRequired,
} = require('../constants/service-flow-nodes')
const {
  buildQuoteLinesFromFindings,
  isQuoteEvidenceFinding,
  listQuoteLineEvidenceUrls,
  normalizeQuoteLine,
  collectInspectionReportGaps,
  collectQuoteConfirmGaps,
  collectWorkPhotoDraftGaps,
} = require('./service-flow-docs')

test('does not prefill quote lines from detection findings', () => {
  const lines = buildQuoteLinesFromFindings([
    { partName: '右前门', result: FINDING_RESULT.ACTION, advice: '划痕', url: 'https://a.jpg' },
    { partName: '仪表', result: FINDING_RESULT.RECORD, url: 'https://b.jpg' },
  ])
  assert.equal(lines.length, 0)
})

test('only watch/action photos with url enter quote evidence pool', () => {
  assert.equal(
    isQuoteEvidenceFinding({
      partName: '右前门',
      result: FINDING_RESULT.ACTION,
      url: 'https://a.jpg',
    }),
    true,
  )
  assert.equal(
    isQuoteEvidenceFinding({
      partName: '底盘',
      result: FINDING_RESULT.WATCH,
      url: 'https://b.jpg',
    }),
    true,
  )
  assert.equal(
    isQuoteEvidenceFinding({
      partName: '仪表',
      result: FINDING_RESULT.RECORD,
      url: 'https://c.jpg',
    }),
    false,
  )
  assert.equal(
    isQuoteEvidenceFinding({
      partName: '机油',
      result: FINDING_RESULT.OK,
      url: 'https://d.jpg',
    }),
    false,
  )
  assert.equal(
    isQuoteEvidenceFinding({
      partName: '右前门',
      result: FINDING_RESULT.ACTION,
      url: '',
    }),
    false,
  )
})

test('normalizeQuoteLine keeps multiple evidence urls and first as evidenceUrl', () => {
  const line = normalizeQuoteLine({
    name: '全车补漆',
    amount: 2800,
    evidenceUrls: ['https://a.jpg', 'https://b.jpg'],
    evidenceUrl: 'https://old.jpg',
  })
  assert.deepEqual(line.evidenceUrls, ['https://a.jpg', 'https://b.jpg', 'https://old.jpg'])
  assert.equal(line.evidenceUrl, 'https://a.jpg')
  assert.deepEqual(listQuoteLineEvidenceUrls(line), line.evidenceUrls)
})

test('record-only findings skip advice and quote evidence', () => {
  assert.equal(findingAdviceRequired(FINDING_RESULT.RECORD), false)
  const gaps = collectInspectionReportGaps({
    chiefComplaint: '到店保养',
    findings: [
      { partName: '仪表', result: FINDING_RESULT.RECORD, url: 'https://meter.jpg' },
    ],
  })
  assert.deepEqual(gaps, [])
})

test('owner copy maps 仅记录 to 已留证', () => {
  assert.equal(ownerFindingResultLabel(FINDING_RESULT.RECORD), '已留证')
  assert.equal(ownerFindingResultLabel(FINDING_RESULT.ACTION), '需处理')
})

test('addon quote still requires evidence when asked', () => {
  const gaps = collectQuoteConfirmGaps(
    { lines: [{ name: '更换球头', amount: 200 }] },
    { requireEvidence: true },
  )
  assert.equal(gaps.some((row) => /检测图|故障图/.test(row)), true)
})

test('work photo gaps ask for 项目, not 部位', () => {
  const gaps = collectWorkPhotoDraftGaps({
    findings: [{ images: [{ url: 'https://w.jpg' }], partName: '' }],
  })
  assert.equal(gaps.some((row) => row.includes('项目')), true)
  assert.equal(gaps.some((row) => row.includes('部位')), false)
})
