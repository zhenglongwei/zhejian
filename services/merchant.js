/**
 * 商家入驻与工作台
 * API: /api/v1/merchant/onboarding*
 */
const { ENV } = require('./config')
const { get, put, post } = require('./request')
const { saveSession } = require('../utils/auth')

const STORAGE_KEY = 'merchant_profile_v1'

const MERCHANT_STATUS = {
  NONE: 'none',
  DRAFT: 'draft',
  PENDING: 'pending',
  NEED_MODIFY: 'need_modify',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

function delay(ms = 200) {
  return new Promise((r) => setTimeout(r, ms))
}

function getLocalProfile() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || null
  } catch (e) {
    return null
  }
}

function saveLocalProfile(data) {
  wx.setStorageSync(STORAGE_KEY, data)
  return data
}

function applyAuthSession(session) {
  if (!session) return
  saveSession({
    token: session.token,
    user: session.user,
    roles: session.roles || ['user'],
    merchant: session.merchant || null,
  })
}

async function refreshMerchantSession() {
  if (ENV.mode === 'mock') return null
  const data = await post('/merchant/auth/refresh-session')
  applyAuthSession(data)
  return data
}

async function fetchMerchantProfile() {
  if (ENV.mode === 'mock') {
    await delay()
    return getLocalProfile()
  }

  try {
    const profile = await get('/merchant/onboarding')
    if (profile) {
      saveLocalProfile(profile)
    }
    return profile
  } catch (e) {
    if (e && (e.code === 401 || e.code === 100002)) {
      return null
    }
    throw e
  }
}

async function saveOnboardingDraft(form) {
  if (ENV.mode === 'mock') {
    await delay(150)
    const profile = {
      status: MERCHANT_STATUS.DRAFT,
      ...form,
      storeId: form.storeId || 'store_demo_1',
      updatedAt: Date.now(),
    }
    saveLocalProfile(profile)
    return profile
  }

  const profile = await put('/merchant/onboarding/draft', form)
  saveLocalProfile(profile)
  return profile
}

async function recognizeLicenseOcr(licensePhotoUrl) {
  if (ENV.mode === 'mock') {
    await delay(400)
    return {
      legalName: '杭州辙见汽车服务有限公司',
      creditCode: '91330100MA2XXXXX0X',
      legalPerson: '张三',
      businessScope: '机动车维修经营',
      companyType: '有限责任公司',
      businessAddress: '浙江省杭州市西湖区示例路 1 号',
      provider: 'mock',
    }
  }
  return post('/merchant/onboarding/license-ocr', { licensePhotoUrl })
}

async function submitOnboarding(form) {
  if (ENV.mode === 'mock') {
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
    saveLocalProfile(profile)
    return { profile, session: null }
  }

  const data = await post('/merchant/onboarding/submit', form, { showLoading: true, loadingText: '提交中' })
  if (data.profile) {
    saveLocalProfile(data.profile)
  }
  if (data.session) {
    applyAuthSession(data.session)
  } else if (data.profile && data.profile.status === MERCHANT_STATUS.APPROVED) {
    await refreshMerchantSession()
  }
  return data
}

function getProfile() {
  return getLocalProfile()
}

function cacheMerchantProfile(profile) {
  if (profile) {
    saveLocalProfile(profile)
  }
  return profile
}

module.exports = {
  MERCHANT_STATUS,
  fetchMerchantProfile,
  submitOnboarding,
  saveOnboardingDraft,
  refreshMerchantSession,
  getProfile,
  cacheMerchantProfile,
  recognizeLicenseOcr,
}
