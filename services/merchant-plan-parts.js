const { ENV } = require('./config')
const { get, post } = require('./request')
const { getProfile } = require('./merchant')
const { getSession } = require('../utils/auth')

function resolveStoreId() {
  const session = getSession()
  if (session.merchant && session.merchant.storeId) {
    return session.merchant.storeId
  }
  const profile = getProfile()
  return (profile && profile.storeId) || ''
}

function withStore(params = {}) {
  const storeId = resolveStoreId()
  if (!storeId) return params
  return { ...params, storeId }
}

async function fetchMerchantPlanParts(albumId) {
  if (ENV.mode === 'mock') {
    const { mockFetchMerchantPlanParts } = require('../mock/service-albums')
    return mockFetchMerchantPlanParts(albumId)
  }
  return get(`/merchant/service-albums/${albumId}/plan-parts`, withStore())
}

async function saveMerchantPlanPartsDraft(albumId, payload) {
  if (ENV.mode === 'mock') {
    const { mockSaveMerchantPlanPartsDraft } = require('../mock/service-albums')
    return mockSaveMerchantPlanPartsDraft(albumId, payload)
  }
  return post(`/merchant/service-albums/${albumId}/plan-parts`, withStore(payload))
}

async function lockMerchantPlanParts(albumId) {
  if (ENV.mode === 'mock') {
    const { mockLockMerchantPlanParts } = require('../mock/service-albums')
    return mockLockMerchantPlanParts(albumId)
  }
  return post(`/merchant/service-albums/${albumId}/plan-parts/lock`, withStore())
}

async function unlockMerchantPlanParts(albumId) {
  if (ENV.mode === 'mock') {
    const { mockUnlockMerchantPlanParts } = require('../mock/service-albums')
    return mockUnlockMerchantPlanParts(albumId)
  }
  return post(`/merchant/service-albums/${albumId}/plan-parts/unlock`, withStore())
}

async function runMerchantPlanQuoteOcr(albumId, payload = {}) {
  if (ENV.mode === 'mock') {
    const { mockRunMerchantPlanQuoteOcr } = require('../mock/service-albums')
    return mockRunMerchantPlanQuoteOcr(albumId, payload)
  }
  return post(`/merchant/service-albums/${albumId}/plan-parts/ocr`, withStore(payload))
}

async function recognizePartLabelOcr(albumId, payload = {}) {
  const imageUrls = Array.isArray(payload.imageUrls)
    ? payload.imageUrls
    : payload.imageUrl
      ? [payload.imageUrl]
      : []
  if (ENV.mode === 'mock') {
    const urls = imageUrls.length ? imageUrls : ['mock://local']
    const raw = urls.flatMap((url, imageIndex) => [
      {
        partCode: `MOCK-CODE-${imageIndex + 1}A`,
        partBrand: imageIndex === 0 ? '演示品牌' : '',
        imageIndex,
        imageUrl: url,
        snippet: `MOCK-CODE-${imageIndex + 1}A`,
      },
      {
        partCode: `MOCK-CODE-${imageIndex + 1}B`,
        partBrand: '',
        imageIndex,
        imageUrl: url,
        snippet: `MOCK-CODE-${imageIndex + 1}B`,
      },
    ])
    const seen = new Set()
    const candidates = raw.filter((item) => {
      if (seen.has(item.partCode)) return false
      seen.add(item.partCode)
      return true
    })
    return {
      candidates,
      partCode: candidates[0]?.partCode || '',
      partBrand: candidates[0]?.partBrand || '',
      imageCount: urls.length,
      provider: 'mock',
    }
  }
  return post(`/merchant/service-albums/${albumId}/parts/label-ocr`, { imageUrls })
}

module.exports = {
  fetchMerchantPlanParts,
  saveMerchantPlanPartsDraft,
  lockMerchantPlanParts,
  unlockMerchantPlanParts,
  runMerchantPlanQuoteOcr,
  recognizePartLabelOcr,
}
