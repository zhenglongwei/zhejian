/**
 * 商家门店展示资料（M-STORE-03）
 * API: PUT /api/v1/merchant/store
 */
const { ENV } = require('./config')
const { put } = require('./request')
const { cacheMerchantProfile } = require('./merchant')

function delay(ms = 200) {
  return new Promise((r) => setTimeout(r, ms))
}

async function updateStoreDisplayProfile(form) {
  if (ENV.mode === 'mock') {
    await delay(300)
    const profile = {
      status: 'approved',
      storeId: form.storeId || 'store_demo_1',
      storePhone: form.storePhone,
      businessHours: form.businessHours,
      intro: form.intro,
      services: form.services || [],
      photos: form.photos || {},
    }
    cacheMerchantProfile(profile)
    return profile
  }

  const profile = await put('/merchant/store', form, {
    showLoading: true,
    loadingText: '保存中',
  })
  cacheMerchantProfile(profile)
  return profile
}

module.exports = {
  updateStoreDisplayProfile,
}
