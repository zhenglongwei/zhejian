const assert = require('assert')
const {
  ATTRIBUTION_STATUS,
  buildArchiveAttribution,
  isStoreShowcaseCase,
  attachArchiveAttribution,
  factHeadline,
} = require('./archive-attribution')

function testStorePublishedKeepsStoreAsAuthor() {
  const attr = buildArchiveAttribution({
    storeName: '城北汽修',
    vehicleText: '朗逸',
    serviceName: '刹车保养',
    authorizationTier: 'merchant_published',
  })
  assert.strictEqual(attr.status, ATTRIBUTION_STATUS.STORE_PUBLISHED)
  assert.strictEqual(attr.showStoreAsAuthor, true)
  assert.strictEqual(attr.sourceLabel, '商家上传')
  assert.strictEqual(attr.schemaStoreAttributionStatus, 'store_published')
  assert.ok(attr.storeAttributionLabel.indexOf('城北汽修') >= 0)
}

function testUnconfirmedNeverAuthorsStore() {
  const attr = buildArchiveAttribution({
    hostMeta: { attributionStatus: 'claimed_unconfirmed' },
    storeName: '城北汽修',
    vehicleText: '朗逸',
    serviceName: '刹车保养',
  })
  assert.strictEqual(attr.status, ATTRIBUTION_STATUS.CLAIMED_UNCONFIRMED)
  assert.strictEqual(attr.showStoreAsAuthor, false)
  assert.strictEqual(attr.sourceLabel, '提交者声称')
  assert.strictEqual(attr.schemaStoreAttributionStatus, 'claimed')
  assert.strictEqual(attr.claimedStoreName, '城北汽修')
  assert.ok(attr.storeAttributionLabel.indexOf('未确认') >= 0)
  assert.strictEqual(attr.factHeadline, '朗逸刹车保养')
}

function testShowcaseFilter() {
  assert.strictEqual(
    isStoreShowcaseCase({ status: ATTRIBUTION_STATUS.STORE_PUBLISHED }),
    true
  )
  assert.strictEqual(isStoreShowcaseCase({ status: ATTRIBUTION_STATUS.STORE_CLAIMED }), true)
  assert.strictEqual(
    isStoreShowcaseCase({ status: ATTRIBUTION_STATUS.CLAIMED_UNCONFIRMED }),
    false
  )
}

function testAttachOverridesSeoTitleWhenUnconfirmed() {
  const item = attachArchiveAttribution(
    {
      title: '城北汽修朗逸刹车保养案例',
      storeName: '城北汽修',
      vehicleText: '朗逸',
      serviceName: '刹车保养',
      authorizationTier: 'merchant_published',
      seo: { title: '带店名的旧标题' },
    },
    { hostMeta: { attributionStatus: 'claimed_unconfirmed' } }
  )
  assert.strictEqual(item.attribution.showStoreAsAuthor, false)
  assert.strictEqual(item.seoTitle, '朗逸刹车保养')
  assert.strictEqual(item.seo.title, '朗逸刹车保养')
}

function testFactHeadlineFallback() {
  assert.strictEqual(factHeadline({}), '维修案例')
  assert.strictEqual(factHeadline({ serviceName: '保养' }), '保养')
}

testStorePublishedKeepsStoreAsAuthor()
testUnconfirmedNeverAuthorsStore()
testShowcaseFilter()
testAttachOverridesSeoTitleWhenUnconfirmed()
testFactHeadlineFallback()
console.log('archive-attribution.test.js OK')
