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

async function recognizePartLabelOcr(albumId, imageUrl) {
  if (ENV.mode === 'mock') {
    return {
      partCode: 'MOCK-CODE-001',
      partBrand: '演示品牌',
      provider: 'mock',
    }
  }
  return post(`/merchant/service-albums/${albumId}/parts/label-ocr`, { imageUrl })
}

module.exports = {
  fetchMerchantPlanParts,
  saveMerchantPlanPartsDraft,
  lockMerchantPlanParts,
  unlockMerchantPlanParts,
  runMerchantPlanQuoteOcr,
  recognizePartLabelOcr,
}
