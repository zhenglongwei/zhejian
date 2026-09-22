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
  readBrandAuthItemsFromPhotos,
} = require('../utils/store-capability')
const {
  resolveStoreCapabilityJson,
  saveStoreCapabilityJson,
  isCapabilityFieldError,
} = require('../utils/store-capability-load')
const { resolveClientReadableMediaUrl } = require('../lib/media-storage')
const { evaluateAuthSubmission, AUTH_STATUS } = require('../utils/merchant-trust')

const STAFF_ROLE_OWNER = 'owner'
const STAFF_STATUS_ACTIVE = 'ACTIVE'

function resignEquipmentTags(tags) {
  return (tags || []).map((item) => {
    if (!item || typeof item !== 'object') return item
    if (!item.imageUrl) return item
    return { ...item, imageUrl: resolveClientReadableMediaUrl(item.imageUrl) }
  })
}

function resignTechnicians(list) {
  return (list || []).map((item) => {
    if (!item || typeof item !== 'object') return item
    return {
      ...item,
      avatarUrl: resolveClientReadableMediaUrl(item.avatarUrl || ''),
      credentialPhotoUrls: (item.credentialPhotoUrls || [])
        .map((url) => resolveClientReadableMediaUrl(url))
        .filter(Boolean),
    }
  })
}

function resignBrandAuthItems(items) {
  return (items || []).map((item) => {
    if (!item || typeof item !== 'object') return item
    return {
      ...item,
      imageUrl: resolveClientReadableMediaUrl(item.imageUrl || ''),
    }
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
  const brandAuthItems = resignBrandAuthItems(capabilityEditor.brandAuthItems)
  return {
    ...profile,
    ...capabilityEditor,
    technicians: resignTechnicians(capabilityEditor.technicians),
    equipmentTags: resignEquipmentTags(capabilityEditor.equipmentTags),
    brandAuthItems,
    brandAuthPhotoUrl: resolveClientReadableMediaUrl(
      brandAuthItems[0]?.imageUrl ||
        capabilityEditor.brandAuthPhotoUrl ||
        photos.brandAuthUrl ||
        ''
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
  const submittedBrandAuthItems = readBrandAuthItemsFromPhotos(
    {
      brandAuthItems: rawForm.brandAuthItems || payload.brandAuthItems || payload.photos.brandAuthItems,
      brandAuthUrl: payload.photos.brandAuthUrl,
      brandAuthValidUntil: payload.brandAuthValidUntil || rawForm.brandAuthValidUntil,
    },
    payload.brandAuthValidUntil || rawForm.brandAuthValidUntil
  )
  const { capability, brandAuthItems } = mergeCapabilityFromMerchantEdit(
    existingCapability,
    {
      specialtyBrands: rawForm.specialtyBrands,
      notAccepting: rawForm.notAccepting,
      technicians: rawForm.technicians,
      equipmentTags: rawForm.equipmentTags,
      brandAuthItems: submittedBrandAuthItems,
      brandAuthValidUntil: payload.brandAuthValidUntil || rawForm.brandAuthValidUntil,
      bookingPaused: rawForm.bookingPaused,
    },
    prevPhotos
  )
  const liveBrandAuthItems = brandAuthItems || submittedBrandAuthItems

  const photosToSave = {
    ...prevPhotos,
    ...payload.photos,
    brandAuthItems: liveBrandAuthItems,
    brandAuthUrl: liveBrandAuthItems[0]?.imageUrl || '',
  }

  const baseData = {
    phone: payload.storePhone,
    businessHours: payload.businessHours,
    intro: payload.intro,
    servicesJson: payload.services,
    photosJson: photosToSave,
  }
  if (payload.identityProvided) {
    baseData.name = payload.storeName
    baseData.address = payload.address || ''
    baseData.latitude = payload.latitude
    baseData.longitude = payload.longitude
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

  const merchant = await prisma.merchant.findUnique({
    where: { id: auth.merchantId },
  })
  if (payload.identityProvided && merchant) {
    const merchantData = {
      name: payload.storeName,
      contactName: payload.contactName || '',
      contactPhone: payload.contactPhone || '',
      legalName: payload.legalName || '',
      creditCode: payload.creditCode || '',
      licensePhotoUrl: payload.licensePhotoUrl || '',
      legalIdPhotoUrl: payload.legalIdPhotoUrl || '',
      contactEmail: payload.contactEmail || '',
      licenseEstablishedOn: payload.licenseEstablishedOn
        ? new Date(`${payload.licenseEstablishedOn}T00:00:00.000Z`)
        : null,
    }
    if (payload.qualification) {
      merchantData.qualificationJson = payload.qualification
    }
    const licenseTouched = payload.licensePhotoUrl !== (merchant.licensePhotoUrl || '')
    const idTouched = payload.legalIdPhotoUrl !== (merchant.legalIdPhotoUrl || '')
    if (licenseTouched || idTouched) {
      const evalResult = evaluateAuthSubmission({
        licensePhotoUrl: merchantData.licensePhotoUrl,
        legalIdPhotoUrl: merchantData.legalIdPhotoUrl,
        legalName: merchantData.legalName,
        creditCode: merchantData.creditCode,
      })
      merchantData.authStatus = evalResult.authStatus
      if (evalResult.authStatus === AUTH_STATUS.VERIFIED) {
        merchantData.authVerifiedAt = new Date()
      }
    }
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: merchantData,
    })
  }

  try {
    const { refreshMerchantCompleteness } = require('./merchant-onboarding.service')
    await refreshMerchantCompleteness(auth.merchantId, storeId)
  } catch (_) {
    /* ignore */
  }
  const merchantFresh =
    (await prisma.merchant.findUnique({ where: { id: auth.merchantId } })) || merchant

  const profile = formatOnboardingProfile(merchantFresh, updatedStore)
  return {
    ...attachCapabilityToProfile(profile, updatedStore, capability),
    brandAuthReviewSubmitted: false,
  }
}

module.exports = {
  updateStoreDisplayProfile,
  assertMerchantOwner,
  attachCapabilityToProfile,
  readCapabilityJson,
}
