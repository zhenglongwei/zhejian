/**
 * 商家入驻与工作台
 * API: /api/v1/merchant/onboarding*
 */
const { ENV } = require('./config')
const { get, put, post } = require('./request')
const { saveSession, getSession } = require('../utils/auth')

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

async function fetchMerchantWorkbenchEntries() {
  if (ENV.mode === 'mock') {
    await delay(120)
    const profile = getLocalProfile()
    if (!profile || profile.status === MERCHANT_STATUS.NONE) {
      return { list: [], total: 0 }
    }
    const list = [
      {
        merchantId: profile.merchantId || 'merchant_demo_1',
        storeId: profile.storeId || 'store_demo_1',
        storeName: profile.storeName || '演示门店',
        address: profile.address || '',
        status: profile.status || MERCHANT_STATUS.APPROVED,
        statusLabel: '已通过',
        canEnterWorkbench: profile.status === MERCHANT_STATUS.APPROVED,
      },
    ]
    if (profile.storeId === 'store_demo_1') {
      list.push({
        merchantId: 'merchant_demo_2',
        storeId: 'store_demo_002',
        storeName: '辙见城西分店（演示）',
        address: '杭州市西湖区示例路 88 号',
        status: MERCHANT_STATUS.APPROVED,
        statusLabel: '已通过',
        canEnterWorkbench: true,
      })
    }
    return { list, total: list.length }
  }
  return get('/merchant/workbench-entries')
}

async function beginNewMerchantStore() {
  if (ENV.mode === 'mock') {
    await delay(150)
    const profile = {
      status: MERCHANT_STATUS.DRAFT,
      merchantId: 'merchant_demo_new',
      storeId: 'store_demo_new',
      storeName: '',
      contactName: '',
      phone: '',
      address: '',
      services: [],
    }
    saveLocalProfile(profile)
    return profile
  }
  const profile = await post('/merchant/onboarding/new')
  if (profile) saveLocalProfile(profile)
  return profile
}

async function fetchMerchantStores() {
  if (ENV.mode === 'mock') {
    await delay(120)
    const profile = getLocalProfile()
    const list = [
      {
        id: profile?.storeId || 'store_demo_1',
        name: profile?.storeName || '演示门店',
        address: profile?.address || '',
      },
    ]
    if (profile?.storeId === 'store_demo_1') {
      list.push({
        id: 'store_demo_002',
        name: '辙见城西分店（演示）',
        address: '杭州市西湖区示例路 88 号',
      })
    }
    return { list, total: list.length }
  }
  return get('/merchant/stores')
}

async function switchMerchantStore(storeId) {
  if (ENV.mode === 'mock') {
    await delay(200)
    const profile = getLocalProfile() || {}
    const stores = (await fetchMerchantStores()).list || []
    const picked = stores.find((s) => s.id === storeId)
    if (!picked) {
      const err = new Error('门店不存在')
      err.code = 404
      throw err
    }
    const next = {
      ...profile,
      storeId: picked.id,
      storeName: picked.name,
      address: picked.address,
    }
    saveLocalProfile(next)
    const session = getSession()
    saveSession({
      ...session,
      merchant: {
        ...(session.merchant || {}),
        storeId: picked.id,
      },
    })
    return next
  }
  const session = await post('/merchant/auth/switch-store', { storeId })
  applyAuthSession(session)
  const profile = await get('/merchant/onboarding', {
    merchantId: session.merchant?.merchantId,
    storeId: session.merchant?.storeId,
  })
  if (profile) saveLocalProfile(profile)
  return profile
}

async function fetchMerchantProfile(options = {}) {
  if (ENV.mode === 'mock') {
    await delay()
    return getLocalProfile()
  }

  try {
    const session = getSession()
    const query = {}
    if (options.merchantId || session.merchant?.merchantId) {
      query.merchantId = options.merchantId || session.merchant.merchantId
    }
    if (options.storeId || session.merchant?.storeId) {
      query.storeId = options.storeId || session.merchant.storeId
    }
    if (options.preferIncomplete) {
      query.preferIncomplete = '1'
    }
    const profile = await get('/merchant/onboarding', query)
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

  const profile = await put('/merchant/onboarding/draft', buildDraftPayload(form))
  saveLocalProfile(profile)
  return profile
}

function buildDraftPayload(form) {
  const profile = getLocalProfile()
  return {
    ...form,
    merchantId: form.merchantId || profile?.merchantId || '',
  }
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

  const data = await post('/merchant/onboarding/submit', buildDraftPayload({
    ...form,
    agreed: form.agreed,
  }), { showLoading: true, loadingText: '提交中' })
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
  fetchMerchantWorkbenchEntries,
  fetchMerchantStores,
  switchMerchantStore,
  beginNewMerchantStore,
  submitOnboarding,
  saveOnboardingDraft,
  refreshMerchantSession,
  getProfile,
  cacheMerchantProfile,
  recognizeLicenseOcr,
}
