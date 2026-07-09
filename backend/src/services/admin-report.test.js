const test = require('node:test')
const assert = require('node:assert/strict')

const { buildReportOfflineAuditComment } = require('./admin-report.service')

test('buildReportOfflineAuditComment includes snapshot audit when frozen', () => {
  const text = buildReportOfflineAuditComment({
    comment: '虚假信息',
    reportId: 'rpt_abc',
    snapshotVersion: 2,
    frozenAt: '2026-07-09T08:00:00.000Z',
    hadSnapshot: true,
  })
  assert.match(text, /虚假信息/)
  assert.match(text, /reportId=rpt_abc/)
  assert.match(text, /snapshotVersion=2/)
  assert.match(text, /frozenAt=2026-07-09T08:00:00.000Z/)
  assert.match(text, /snapshotPreserved=1/)
})

test('buildReportOfflineAuditComment marks legacy case without snapshot', () => {
  const text = buildReportOfflineAuditComment({
    reportId: 'rpt_legacy',
    hadSnapshot: false,
  })
  assert.match(text, /举报成立/)
  assert.match(text, /snapshotPreserved=0/)
  assert.doesNotMatch(text, /snapshotVersion=/)
})
