const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeLicenseEstablishedOn,
  buildOperatingYearsMeta,
} = require('./license-established')

describe('normalizeLicenseEstablishedOn', () => {
  it('parses ISO and Chinese dates', () => {
    assert.equal(normalizeLicenseEstablishedOn('2016-03-01'), '2016-03-01')
    assert.equal(normalizeLicenseEstablishedOn('2016年3月1日'), '2016-03-01')
    assert.equal(normalizeLicenseEstablishedOn('2016年03月01日至长期'), '2016-03-01')
  })
})

describe('buildOperatingYearsMeta', () => {
  it('builds plain operating years label', () => {
    const meta = buildOperatingYearsMeta('2016-03-01', new Date(Date.UTC(2026, 7, 1)))
    assert.ok(meta)
    assert.equal(meta.years, 10)
    assert.equal(meta.label, '成立于 2016 年 · 经营约 10 年')
    assert.equal(meta.foundingDate, '2016-03-01')
  })

  it('handles less than one year', () => {
    const meta = buildOperatingYearsMeta('2026-01-01', new Date(Date.UTC(2026, 7, 1)))
    assert.ok(meta)
    assert.equal(meta.years, 0)
    assert.match(meta.label, /经营未满 1 年/)
  })
})
