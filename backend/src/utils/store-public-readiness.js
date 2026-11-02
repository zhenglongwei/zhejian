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
  setupNextStep,
  isStorePublicReady,
}
