const assert = require('assert')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { resolvePublishLabel, resolveRecentH5Url } = require('./merchant-public-case.service')

const freshHosted = {
  status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
  storefrontHidden: false,
  articleStatus: 'ready',
  seoNoindex: false,
  id: 'case_fresh',
  slug: 'demo-case',
}

assert.strictEqual(resolvePublishLabel(freshHosted).key, 'published_h5')
assert.strictEqual(resolvePublishLabel(freshHosted).label, '已上网站')
assert.ok(resolveRecentH5Url(freshHosted))

const hidden = { ...freshHosted, storefrontHidden: true }
assert.strictEqual(resolveRecentH5Url(hidden), '')

const pending = { status: PUBLIC_CASE_STATUS.PENDING_REVIEW, id: 'case_pending' }
assert.strictEqual(resolvePublishLabel(pending).label, '审核中')
assert.strictEqual(resolveRecentH5Url(pending), '')

const privatePage = { ...freshHosted, seoNoindex: true }
assert.strictEqual(resolvePublishLabel(privatePage).key, 'published_h5_private')
assert.ok(resolveRecentH5Url(privatePage))

console.log('merchant-public-case.publish-label.test.js OK')
