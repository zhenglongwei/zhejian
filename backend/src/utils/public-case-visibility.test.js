const assert = require('assert')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { publicCaseH5Where, isPublicCaseH5Visible } = require('./public-case-visibility')

const where = publicCaseH5Where({ storeId: 'sto_1' })
assert.strictEqual(where.status, PUBLIC_CASE_STATUS.PUBLIC_APPROVED)
assert.strictEqual(where.storefrontHidden, false)
assert.strictEqual(where.storeId, 'sto_1')
assert.strictEqual(where.articleStatus, undefined)

assert.strictEqual(
  isPublicCaseH5Visible({ status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED, storefrontHidden: false }),
  true
)
assert.strictEqual(
  isPublicCaseH5Visible({
    status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
    storefrontHidden: false,
    articleStatus: 'ready',
  }),
  true
)
assert.strictEqual(
  isPublicCaseH5Visible({ status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED, storefrontHidden: true }),
  false
)
assert.strictEqual(isPublicCaseH5Visible({ status: PUBLIC_CASE_STATUS.AUDIT_PASSED }), false)

const { publicCaseRelistPatch } = require('./public-case-visibility')
const relist = publicCaseRelistPatch(false)
assert.strictEqual(relist.storefrontHidden, false)
assert.strictEqual(relist.seoNoindex, false)
assert.strictEqual(publicCaseRelistPatch(true).seoNoindex, true)

console.log('public-case-visibility.test.js OK')
