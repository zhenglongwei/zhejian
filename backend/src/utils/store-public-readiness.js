/**
 * 门店对访客公开：认证已过 + 基础资料齐 + 执照未被别家占用。
 * 口径：docs/03_商家端/01_商家入驻PRD.md
 */
const { AUTH_STATUS, normalizeCreditCode } = require('./merchant-trust')
const { isPlaceholderStoreName } = require('./store-public-display')
const { MERCHANT_STATUS, STORE_STATUS } = require('../constants/merchant')

const INTRO_FULL = 40

function text(value) {
  return String(value || '').trim()
}

function list(value) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []
}

function readPhotos(store) {
  const raw = store && store.photosJson
  return raw && typeof raw === 'object' ? raw : {}
}

function readBasicSlots(merchant = {}, store = {}) {
  const photos = readPhotos(store)
  const reception = list(photos.receptionUrls)
  const singleReception = text(photos.receptionUrl)
  return {
    name: text(store.name || store.storeName || merchant.name),
    address: text(store.address),
    phone: text(store.phone || store.storePhone || merchant.contactPhone),
    hours: text(store.businessHours),
    intro: text(store.intro),
    facade: text(photos.facadeUrl),
    workshop: list(photos.workshopUrls),
    reception: reception.length ? reception : singleReception ? [singleReception] : [],
  }
}

function isBasicStoreProfileComplete(merchant = {}, store = {}) {
  const slots = readBasicSlots(merchant, store)
  if (isPlaceholderStoreName(slots.name)) return false
  if (!slots.address) return false
  if (!slots.phone) return false
  if (!slots.hours) return false
  if (slots.intro.length < INTRO_FULL) return false
  if (!slots.facade) return false
  if (!slots.workshop.length) return false
  if (!slots.reception.length) return false
  return true
}

function authMaterialsReady(merchant = {}) {
  return Boolean(
    text(merchant.licensePhotoUrl) &&
      text(merchant.legalIdPhotoUrl) &&
      text(merchant.legalIdBackPhotoUrl)
  )
}

function profileMissingNotes(merchant = {}, store = {}) {
  const slots = readBasicSlots(merchant, store)
  const notes = []
  if (!slots.name || isPlaceholderStoreName(slots.name)) notes.push('店名')
  if (!slots.address) notes.push('地址')
  if (!slots.phone) notes.push('电话')
  if (!slots.hours) notes.push('营业时间')
  if (!slots.intro) notes.push('介绍')
  else if (slots.intro.length < INTRO_FULL) notes.push('介绍写短了')
  if (!slots.facade) notes.push('门头照片')
  if (!slots.workshop.length) notes.push('工位照片')
  if (!slots.reception.length) notes.push('接待区照片')
  return notes
}

function describePublicGate(merchant = {}, store = {}, options = {}) {
  const setupNext = setupNextStep(merchant, store, options)
  const ready = isStorePublicReady(merchant, store, options)
  if (ready) {
    return {
      ready: true,
      setupNext: '',
      reasonKey: '',
      title: '',
      message: '',
      action: '',
      actionLabel: '',
      missingLine: '',
    }
  }
  const merchantStatus = String(merchant.status || '')
  const storeStatus = String(store.status || '')
  if (
    (merchantStatus && merchantStatus !== MERCHANT_STATUS.ACTIVE) ||
    (storeStatus && storeStatus !== STORE_STATUS.ACTIVE)
  ) {
    return {
      ready: false,
      setupNext,
      reasonKey: 'inactive',
      title: '门店未开放',
      message: '门店当前未开放，档案不会出现在网站上。',
      action: '',
      actionLabel: '',
      missingLine: '',
    }
  }
  if (setupNext === 'licenseTaken') {
    return {
      ready: false,
      setupNext,
      reasonKey: 'licenseTaken',
      title: '执照已被占用',
      message: '这张执照已注册过其他门店。',
      action: 'auth',
      actionLabel: '去处理',
      missingLine: '',
    }
  }
  if (setupNext === 'profile') {
    const missing = profileMissingNotes(merchant, store)
    const missingLine = missing.join('、')
    return {
      ready: false,
      setupNext,
      reasonKey: 'needProfile',
      title: '先补门店资料',
      message: missingLine ? `还缺${missingLine}。` : '把门店资料补齐，档案才能出现在网站上。',
      action: 'profile',
      actionLabel: '去补资料',
      missingLine,
    }
  }
  const authStatus = String(merchant.authStatus || '')
  if (authStatus === AUTH_STATUS.FAILED) {
    return {
      ready: false,
      setupNext: 'auth',
      reasonKey: 'authFailed',
      title: '认证未通过',
      message: '认证未通过，请重拍证件。',
      action: 'auth',
      actionLabel: '去认证',
      missingLine: '',
    }
  }
  return {
    ready: false,
    setupNext: setupNext || 'auth',
    reasonKey: 'needAuth',
    title: '先完成认证',
    message: '上传执照和身份证后，档案才能出现在网站上。',
    action: 'auth',
    actionLabel: '去认证',
    missingLine: '',
  }
}

function setupNextStep(merchant = {}, store = {}, options = {}) {
  if (String(merchant.authStatus || '') !== AUTH_STATUS.VERIFIED || !authMaterialsReady(merchant)) {
    return 'auth'
  }
  if (!isBasicStoreProfileComplete(merchant, store)) return 'profile'
  const code = normalizeCreditCode(merchant.creditCode)
  if (!code) return 'auth'
  const ownerId = options.creditCodeOwnerMerchantId
  if (ownerId && String(ownerId) !== String(merchant.id)) return 'licenseTaken'
  return ''
}

function isStorePublicReady(merchant = {}, store = {}, options = {}) {
  if (String(merchant.status || '') !== MERCHANT_STATUS.ACTIVE) return false
  if (String(store.status || '') !== STORE_STATUS.ACTIVE) return false
  if (String(merchant.authStatus || '') !== AUTH_STATUS.VERIFIED) return false
  if (!authMaterialsReady(merchant)) return false
  if (!isBasicStoreProfileComplete(merchant, store)) return false
  const code = normalizeCreditCode(merchant.creditCode)
  if (!code) return false
  const ownerId = options.creditCodeOwnerMerchantId
  if (ownerId && String(ownerId) !== String(merchant.id)) return false
  return true
}

module.exports = {
  INTRO_FULL,
  readBasicSlots,
  isBasicStoreProfileComplete,
  profileMissingNotes,
  setupNextStep,
  describePublicGate,
  isStorePublicReady,
}
