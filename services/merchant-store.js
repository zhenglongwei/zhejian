/**
 * 商家门店展示资料（M-STORE-03）
 * API: PUT /api/v1/merchant/store
 */
const { ENV } = require('./config')
const { post, put } = require('./request')
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

async function polishStoreIntro(facts) {
  if (ENV.mode === 'mock') {
    const err = new Error('演示环境未连接润色')
    throw err
  }
  const data = await post('/merchant/store/intro-polish', facts, {
    showLoading: true,
    loadingText: '润色中',
    timeout: 50000,
  })
  return String((data && data.intro) || '').trim()
}

async function adviseStorePhotos(payload) {
  if (ENV.mode === 'mock') {
    const err = new Error('演示环境未连接识图')
    throw err
  }
  const data = await post('/merchant/store/photo-advice', payload, {
    showLoading: true,
    loadingText: '看照片',
    timeout: 60000,
  })
  return Array.isArray(data && data.lines) ? data.lines : []
}

module.exports = {
  updateStoreDisplayProfile,
  polishStoreIntro,
  adviseStorePhotos,
}
