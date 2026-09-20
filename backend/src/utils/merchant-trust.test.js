const test = require('node:test')
const assert = require('node:assert/strict')
const {
  evaluateAuthSubmission,
  scoreProfileCompleteness,
  buildPublisherTrustBadge,
  AUTH_STATUS,
  COMPLETENESS,
} = require('./merchant-trust')

test('evaluateAuthSubmission requires license + legal id', () => {
  const fail = evaluateAuthSubmission({ legalName: 'A', creditCode: '1' })
  assert.equal(fail.authStatus, AUTH_STATUS.FAILED)

  const pending = evaluateAuthSubmission({
    licensePhotoUrl: 'https://x/a.jpg',
    legalIdPhotoUrl: 'https://x/b.jpg',
  })
  assert.equal(pending.authStatus, AUTH_STATUS.PENDING)

  const ok = evaluateAuthSubmission({
    licensePhotoUrl: 'https://x/a.jpg',
    legalIdPhotoUrl: 'https://x/b.jpg',
    legalName: '杭州测试汽修',
  })
  assert.equal(ok.authStatus, AUTH_STATUS.VERIFIED)
})

test('scoreProfileCompleteness and public badge line', () => {
  const merchant = { accountType: 'merchant', authStatus: 'none' }
  const basic = scoreProfileCompleteness(merchant, { name: '我的门店' })
  assert.equal(basic, COMPLETENESS.BASIC)

  const enriched = scoreProfileCompleteness(merchant, {
    name: '城北变速箱',
    address: '杭州',
    latitude: 30.1,
    longitude: 120.1,
    businessHours: '9-18',
    phone: '13800000000',
    photosJson: { facadeUrl: 'https://x/f.jpg' },
  })
  assert.equal(enriched, COMPLETENESS.ENRICHED)

  const badge = buildPublisherTrustBadge(
    { ...merchant, authStatus: 'verified', profileCompleteness: enriched },
    { name: '城北变速箱' }
  )
  assert.equal(badge.displayLine, '商家 · 已认证 · 资料较全')
  assert.ok(!badge.displayLine.includes('已审核'))
})
