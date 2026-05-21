/**
 * 商家入驻与工作台 — V0.1 极简 mock（审核自动通过）
 * MOCK: wx.storage merchant_profile_v1
 */
const STORAGE_KEY = 'merchant_profile_v1'

const MERCHANT_STATUS = {
  NONE: 'none',
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

function delay(ms = 200) {
  return new Promise((r) => setTimeout(r, ms))
}

function getProfile() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || null
  } catch (e) {
    return null
  }
}

function saveProfile(data) {
  wx.setStorageSync(STORAGE_KEY, data)
  return data
}

async function fetchMerchantProfile() {
  await delay()
  return getProfile()
}

/** 提交入驻 — MVP mock 直接 approved */
async function submitOnboarding(form) {
  await delay(400)
  const profile = {
    status: MERCHANT_STATUS.APPROVED,
    storeName: form.storeName,
    contactName: form.contactName,
    phone: form.phone,
    address: form.address,
    services: form.services || [],
    storeId: 'store_demo_1',
    submittedAt: Date.now(),
    approvedAt: Date.now(),
  }
  saveProfile(profile)
  return profile
}

async function saveOnboardingDraft(form) {
  await delay(150)
  const profile = {
    status: MERCHANT_STATUS.DRAFT,
    ...form,
    storeId: 'store_demo_1',
    updatedAt: Date.now(),
  }
  saveProfile(profile)
  return profile
}

module.exports = {
  MERCHANT_STATUS,
  fetchMerchantProfile,
  submitOnboarding,
  saveOnboardingDraft,
  getProfile,
}
