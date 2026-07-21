const { prisma } = require('../lib/prisma')
const { MERCHANT_STATUS, STORE_STATUS } = require('../constants/merchant')
const { formatOnboardingProfile } = require('./merchant-onboarding.service')
const {
  parseStoreDisplayForm,
  validateStoreDisplayPayload,
} = require('../lib/onboarding-payload')
const {
  mergeCapabilityFromMerchantEdit,
  buildMerchantCapabilityEditorView,
  readCapabilityJson,
} = require('../utils/store-capability')
const {
  resolveStoreCapabilityJson,
  saveStoreCapabilityJson,
  isCapabilityFieldError,
} = require('../utils/store-capability-load')
const { resolveClientReadableMediaUrl } = require('../lib/media-storage')

const STAFF_ROLE_OWNER = 'owner'
const STAFF_STATUS_ACTIVE = 'ACTIVE'

function resignEquipmentTags(tags) {
  return (tags || []).map((item) => {
    if (!item || typeof item !== 'object') return item
    if (!item.imageUrl) return item
    return { ...item, imageUrl: resolveClientReadableMediaUrl(item.imageUrl) }
  })
}

async function assertMerchantOwner(auth) {
  const merchantId = auth.merchantId
  const userId = auth.userId
  if (!merchantId || !userId) {
    const err = new Error('尚未开通商家身份')
    err.status = 403
    throw err
  }

  const staff = await prisma.merchantStaff.findFirst({
    where: {
      merchantId,
      userId,
      status: STAFF_STATUS_ACTIVE,
    },
  })

  if (!staff || staff.role !== STAFF_ROLE_OWNER) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { ownerUserId: true, status: true },
    })
    if (!merchant || merchant.ownerUserId !== userId) {
      const err = new Error('仅店铺管理员可编辑门店资料')
      err.status = 403
      throw err
    }
    if (merchant.status !== MERCHANT_STATUS.ACTIVE) {
      const err = new Error('商家未通过审核')
      err.status = 403
      throw err
    }
    return
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { status: true },
  })
  if (!merchant || merchant.status !== MERCHANT_STATUS.ACTIVE) {
    const err = new Error('商家未通过审核')
    err.status = 403
    throw err
  }
}

async function loadOwnedActiveStore(merchantId, storeId) {
  const store = await prisma.store.findFirst({
    where: {
      id: storeId,
      merchantId,
      status: STORE_STATUS.ACTIVE,
    },
  })
  if (!store) {
    const err = new Error('门店不存在')
    err.status = 404
    throw err
  }
  return store
}

function attachCapabilityToProfile(profile, store, capabilityOverride) {
  if (!profile || !store) return profile
  const photos =
    store.photosJson && typeof store.photosJson === 'object' ? store.photosJson : {}
  const capabilityRaw =
    capabilityOverride !== undefined ? capabilityOverride : store.capabilityJson
  const capabilityEditor = buildMerchantCapabilityEditorView(capabilityRaw, photos)
  return {
    ...profile,
    ...capabilityEditor,
    equipmentTags: resignEquipmentTags(capabilityEditor.equipmentTags),
    brandAuthPhotoUrl: resolveClientReadableMediaUrl(
      capabilityEditor.brandAuthPhotoUrl || photos.brandAuthUrl || ''
    ),
    capabilityReviewStatus: capabilityEditor.reviewStatus,
  }
}

async function updateStoreDisplayProfile(auth, rawForm = {}) {
  await assertMerchantOwner(auth)

  const storeId = String(rawForm.storeId || auth.storeId || '').trim()
  if (!storeId) {
    const err = new Error('未找到门店')
    err.status = 400
    throw err
  }

  const existing = await loadOwnedActiveStore(auth.merchantId, storeId)
  const existingCapability = await resolveStoreCapabilityJson(existing)

  let payload = parseStoreDisplayForm(rawForm)
  payload = validateStoreDisplayPayload(payload)

  const prevPhotos =
    existing.photosJson && typeof existing.photosJson === 'object' ? existing.photosJson : {}
  const prevBrandAuthUrl = String(prevPhotos.brandAuthUrl || '').trim()
  const nextBrandAuthUrl = String(payload.photos.brandAuthUrl || '').trim()

  // 须审：品牌授权图变更时，photos 暂不覆盖已通过图（待审通过后再写）
  const brandAuthChanged = nextBrandAuthUrl !== prevBrandAuthUrl
  const photosToSave = {
    ...payload.photos,
    brandAuthUrl:
      brandAuthChanged && nextBrandAuthUrl
        ? prevBrandAuthUrl
        : nextBrandAuthUrl || prevBrandAuthUrl,
  }

  const { capability, needsReview } = mergeCapabilityFromMerchantEdit(
    existingCapability,
    {
      specialtyBrands: rawForm.specialtyBrands,
      notAccepting: rawForm.notAccepting,
      technicians: rawForm.technicians,
      equipmentTags: rawForm.equipmentTags,
      brandAuthValidUntil: rawForm.brandAuthValidUntil,
      brandAuthChanged,
      prevBrandAuthUrl,
      bookingPaused: rawForm.bookingPaused,
    },
    {
      brandAuthUrl: nextBrandAuthUrl || prevBrandAuthUrl,
    }
  )

  // pending 里保留商家提交的新授权图
  if (needsReview && capability.pending) {
    capability.pending.brandAuthUrl = nextBrandAuthUrl || prevBrandAuthUrl
  }

  const baseData = {
    phone: payload.storePhone,
    businessHours: payload.businessHours,
    intro: payload.intro,
    servicesJson: payload.services,
    photosJson: photosToSave,
  }

  let updatedStore
  try {
    updatedStore = await prisma.store.update({
      where: { id: storeId },
      data: {
        ...baseData,
        capabilityJson: capability,
      },
    })
  } catch (e) {
    if (!isCapabilityFieldError(e)) throw e
    // 基础字段先落库，能力 JSON 走兼容写入
    updatedStore = await prisma.store.update({
      where: { id: storeId },
      data: baseData,
    })
    await saveStoreCapabilityJson(storeId, capability)
    updatedStore = { ...updatedStore, capabilityJson: capability }
  }

  if (needsReview) {
    console.info(
      '[store-capability] pending review',
      storeId,
      'tech',
      (capability.pending?.technicians || []).length,
      'eq',
      (capability.pending?.equipmentTags || []).length
    )
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: auth.merchantId },
  })

  const profile = formatOnboardingProfile(merchant, updatedStore)
  return attachCapabilityToProfile(profile, updatedStore, capability)
}

module.exports = {
  updateStoreDisplayProfile,
  assertMerchantOwner,
  attachCapabilityToProfile,
  readCapabilityJson,
}
