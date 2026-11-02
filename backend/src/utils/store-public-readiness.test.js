const test = require('node:test')
const assert = require('node:assert/strict')
const {
  isBasicStoreProfileComplete,
  isStorePublicReady,
  setupNextStep,
} = require('./store-public-readiness')

const completeStore = {
  name: '城北变速箱',
  address: '杭州',
  phone: '13800000000',
  businessHours: '9-18',
  intro: '专注变速箱维修保养十二年，过程留证，旧件可以到店查看，价格当面说清，完工有记录。',
  status: 'ACTIVE',
  photosJson: {
    facadeUrl: 'https://x/f.jpg',
    workshopUrls: ['https://x/w.jpg'],
    receptionUrls: ['https://x/r.jpg'],
  },
}

test('basic profile needs real name photos and intro', () => {
  assert.equal(isBasicStoreProfileComplete({}, { name: '我的门店' }), false)
  assert.equal(isBasicStoreProfileComplete({}, completeStore), true)
  assert.equal(
    isBasicStoreProfileComplete({}, { ...completeStore, intro: '太短' }),
    false
  )
})

test('public ready needs verified unique license and complete profile', () => {
  const merchant = {
    id: 'm1',
    status: 'ACTIVE',
    authStatus: 'verified',
    creditCode: '91330100MA2XXXXX0X',
    licensePhotoUrl: 'https://x/l.jpg',
    legalIdPhotoUrl: 'https://x/f.jpg',
    legalIdBackPhotoUrl: 'https://x/b.jpg',
  }
  assert.equal(isStorePublicReady(merchant, completeStore, { creditCodeOwnerMerchantId: 'm1' }), true)
  assert.equal(isStorePublicReady({ ...merchant, authStatus: 'none' }, completeStore), false)
  assert.equal(
    isStorePublicReady(merchant, completeStore, { creditCodeOwnerMerchantId: 'm2' }),
    false
  )
  assert.equal(setupNextStep({ authStatus: 'none' }, completeStore), 'auth')
  assert.equal(setupNextStep(merchant, { name: '我的门店' }), 'profile')
  assert.equal(setupNextStep(merchant, completeStore, { creditCodeOwnerMerchantId: 'm1' }), '')
  assert.equal(
    setupNextStep(merchant, completeStore, { creditCodeOwnerMerchantId: 'm2' }),
    'licenseTaken'
  )
})
