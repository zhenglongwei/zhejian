const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { newId, toIso } = require('../lib/ids')
const {
  MERCHANT_STATUS,
  STORE_STATUS,
  toFrontStatus,
  merchantStatusLabel,
} = require('../constants/merchant')
const { buildAuthSession } = require('./auth.service')
const {
  parseOnboardingForm,
  validateSubmitPayload,
  formatQualificationForClient,
  formatPhotosForClient,
} = require('../lib/onboarding-payload')
const { buildMerchantCapabilityEditorView } = require('../utils/store-capability')
const { resolveStoreCapabilityJson } = require('../utils/store-capability-load')
const { resolveClientReadableMediaUrl } = require('../lib/media-storage')

/** 商家端 <image> 无法带 Bearer，读侧须返回新鲜 signed URL */
function resignPhotoMap(photos = {}) {
  return {
    facadeUrl: resolveClientReadableMediaUrl(photos.facadeUrl || ''),
    workshopUrls: (photos.workshopUrls || [])
      .map((url) => resolveClientReadableMediaUrl(url))
      .filter(Boolean),
    receptionUrl: resolveClientReadableMediaUrl(photos.receptionUrl || ''),
    brandAuthUrl: resolveClientReadableMediaUrl(photos.brandAuthUrl || ''),
  }
}

function resignQualification(qualification) {
  if (!qualification || typeof qualification !== 'object') return qualification
  const next = { ...qualification }
  if (next.photoUrl) next.photoUrl = resolveClientReadableMediaUrl(next.photoUrl)
  if (next.newEnergy && typeof next.newEnergy === 'object') {
    next.newEnergy = {
      ...next.newEnergy,
      photoUrl: resolveClientReadableMediaUrl(next.newEnergy.photoUrl || ''),
    }
  }
  return next
}

function resignEquipmentTags(tags) {
  return (tags || []).map((item) => {
    if (!item || typeof item !== 'object') return item
    if (!item.imageUrl) return item
    return { ...item, imageUrl: resolveClientReadableMediaUrl(item.imageUrl) }
  })
}

function formatOnboardingProfile(merchant, store) {
  if (!merchant || !store) return null
  const photos = resignPhotoMap(formatPhotosForClient(store.photosJson))
  const qualification = resignQualification(formatQualificationForClient(merchant.qualificationJson))
  const capabilityEditor = buildMerchantCapabilityEditorView(store.capabilityJson, photos)
  return {
    status: toFrontStatus(merchant.status),
    merchantId: merchant.id,
    storeId: store.id,
    storeName: store.name || merchant.name,
    contactName: merchant.contactName,
    phone: merchant.contactPhone,
    storePhone: store.phone,
    address: store.address,
    latitude: store.latitude,
    longitude: store.longitude,
    businessHours: store.businessHours || '',
    intro: store.intro || '',
    services: Array.isArray(store.servicesJson) ? store.servicesJson : [],
    legalName: merchant.legalName || '',
    creditCode: merchant.creditCode || '',
    licensePhotoUrl: resolveClientReadableMediaUrl(merchant.licensePhotoUrl || ''),
    contactEmail: merchant.contactEmail || '',
    qualification,
    photos,
    specialtyBrands: capabilityEditor.specialtyBrands,
    notAccepting: capabilityEditor.notAccepting,
    technicians: capabilityEditor.technicians,
    equipmentTags: resignEquipmentTags(capabilityEditor.equipmentTags),
    brandAuthValidUntil: capabilityEditor.brandAuthValidUntil,
    brandAuthPhotoUrl: resolveClientReadableMediaUrl(
      capabilityEditor.brandAuthPhotoUrl || photos.brandAuthUrl || ''
    ),
    capabilityReviewStatus: capabilityEditor.reviewStatus,
    capabilityRejectReason: capabilityEditor.rejectReason,
    lastProfileVerifiedAt: capabilityEditor.lastProfileVerifiedAt,
    rejectReason: merchant.rejectReason || '',
    agreedAt: toIso(merchant.agreedAt),
    submittedAt: toIso(merchant.submittedAt),
    approvedAt: toIso(merchant.approvedAt),
  }
}

const INCOMPLETE_MERCHANT_STATUSES = [
  MERCHANT_STATUS.DRAFT,
  MERCHANT_STATUS.PENDING_AUDIT,
  MERCHANT_STATUS.NEED_MODIFY,
  MERCHANT_STATUS.AUDIT_REJECTED,
]

async function loadOwnedMerchant(userId, merchantId, storeStatuses = null) {
  const storeWhere = storeStatuses ? { status: { in: storeStatuses } } : undefined
  return prisma.merchant.findFirst({
    where: {
      id: merchantId,
      ownerUserId: userId,
      status: { not: MERCHANT_STATUS.CLOSED },
    },
    include: {
      stores: {
        where: storeWhere,
        orderBy: { createdAt: 'asc' },
      },
    },
  })
}

async function findIncompleteMerchantApplication(userId) {
  return prisma.merchant.findFirst({
    where: {
      ownerUserId: userId,
      status: { in: INCOMPLETE_MERCHANT_STATUSES },
    },
    include: {
      stores: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { updatedAt: 'desc' },
  })
}

function pickStoreFromMerchant(merchant, { storeId = '', staffStoreId = '', staffRole = 'owner' } = {}) {
  const stores = merchant?.stores || []
  if (!stores.length) return null

  const preferred = String(storeId || '').trim()
  if (preferred) {
    const picked = stores.find((item) => item.id === preferred)
    if (picked) return picked
  }

  if (staffRole !== 'owner' && staffStoreId) {
    const locked = stores.find((item) => item.id === staffStoreId)
    if (locked) return locked
  }

  return stores[0]
}

async function findMerchantApplication(userId, options = {}) {
  const merchantId = String(options.merchantId || '').trim()
  const storeId = String(options.storeId || '').trim()
  const preferIncomplete = Boolean(options.preferIncomplete)

  if (merchantId) {
    const merchant = await loadOwnedMerchant(userId, merchantId)
    if (!merchant?.stores?.length) return null
    const store = pickStoreFromMerchant(merchant, { storeId })
    return store ? { merchant, store } : null
  }

  const staff = await prisma.merchantStaff.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: {
      merchant: {
        include: {
          stores: { where: { status: STORE_STATUS.ACTIVE }, orderBy: { createdAt: 'asc' } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })
  if (staff?.merchant && staff.merchant.stores.length) {
    const store = pickStoreFromMerchant(staff.merchant, {
      storeId,
      staffStoreId: staff.storeId,
      staffRole: staff.role,
    })
    return store ? { merchant: staff.merchant, store } : null
  }

  if (preferIncomplete) {
    const incomplete = await findIncompleteMerchantApplication(userId)
    if (incomplete?.stores?.length) {
      return { merchant: incomplete, store: incomplete.stores[0] }
    }
  }

  const merchant = await prisma.merchant.findFirst({
    where: {
      ownerUserId: userId,
      status: { not: MERCHANT_STATUS.CLOSED },
    },
    include: {
      stores: { where: { status: STORE_STATUS.ACTIVE }, orderBy: { createdAt: 'asc' } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  if (!merchant || !merchant.stores.length) return null
  const store = pickStoreFromMerchant(merchant, { storeId })
  return store ? { merchant, store } : null
}

async function getOnboardingProfile(userId, options = {}) {
  const merchantId = typeof options === 'string' ? '' : String(options.merchantId || '').trim()
  const storeId = typeof options === 'string' ? String(options || '').trim() : String(options.storeId || '').trim()
  const preferIncomplete = typeof options === 'object' && Boolean(options.preferIncomplete)

  const found = await findMerchantApplication(userId, {
    merchantId,
    storeId,
    preferIncomplete,
  })
  if (!found) return null
  const capabilityJson = await resolveStoreCapabilityJson(found.store)
  return formatOnboardingProfile(found.merchant, {
    ...found.store,
    capabilityJson,
  })
}

async function listWorkbenchStoreEntries(userId) {
  const merchants = await prisma.merchant.findMany({
    where: {
      ownerUserId: userId,
      status: { not: MERCHANT_STATUS.CLOSED },
    },
    include: {
      stores: { orderBy: { createdAt: 'asc' }, take: 1 },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return merchants.flatMap((merchant) => {
    const store = merchant.stores[0]
    if (!store) return []
    return [
      {
        merchantId: merchant.id,
        storeId: store.id,
        storeName: store.name || merchant.name,
        address: store.address || '',
        status: toFrontStatus(merchant.status),
        statusLabel: merchantStatusLabel(merchant.status),
        canEnterWorkbench:
          merchant.status === MERCHANT_STATUS.ACTIVE && store.status === STORE_STATUS.ACTIVE,
      },
    ]
  })
}

async function beginNewStoreRegistration(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    const err = new Error('用户不存在')
    err.status = 404
    throw err
  }

  const incomplete = await findIncompleteMerchantApplication(userId)
  if (incomplete?.stores?.length) {
    return formatOnboardingProfile(incomplete, incomplete.stores[0])
  }

  const staffElsewhere = await prisma.merchantStaff.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      merchant: { ownerUserId: { not: userId } },
    },
  })
  if (staffElsewhere) {
    const err = new Error('你已是其他商家的员工，请使用主账号注册新门店')
    err.status = 409
    throw err
  }

  const latestApproved = await prisma.merchant.findFirst({
    where: { ownerUserId: userId, status: MERCHANT_STATUS.ACTIVE },
    orderBy: { updatedAt: 'desc' },
  })

  const merchantId = newId('mer')
  const storeId = newId('store')
  const merchant = await prisma.merchant.create({
    data: {
      id: merchantId,
      ownerUserId: userId,
      status: MERCHANT_STATUS.DRAFT,
      contactName: latestApproved?.contactName || '',
      contactPhone: latestApproved?.contactPhone || user.phone || '',
      legalName: latestApproved?.legalName || '',
      creditCode: latestApproved?.creditCode || '',
      licensePhotoUrl: latestApproved?.licensePhotoUrl || '',
      contactEmail: latestApproved?.contactEmail || '',
      qualificationJson: latestApproved?.qualificationJson || {},
      stores: {
        create: {
          id: storeId,
          status: STORE_STATUS.DRAFT,
          phone: latestApproved?.contactPhone || user.phone || '',
        },
      },
    },
    include: {
      stores: { orderBy: { createdAt: 'asc' } },
    },
  })

  return formatOnboardingProfile(merchant, merchant.stores[0])
}

async function assertCanEditApplication(merchant) {
  if (!merchant) return
  if (merchant.status === MERCHANT_STATUS.ACTIVE) {
    const err = new Error('已入驻，请进入商家工作台')
    err.status = 409
    throw err
  }
  if (merchant.status === MERCHANT_STATUS.PENDING_AUDIT) {
    const err = new Error('入驻审核中，请耐心等待')
    err.status = 409
    throw err
  }
}

function buildMerchantStoreData(payload) {
  return {
    merchant: {
      name: payload.storeName,
      contactName: payload.contactName,
      contactPhone: payload.phone,
      legalName: payload.legalName,
      creditCode: payload.creditCode,
      licensePhotoUrl: payload.licensePhotoUrl,
      contactEmail: payload.contactEmail,
      qualificationJson: payload.qualification,
    },
    store: {
      name: payload.storeName,
      address: payload.address,
      phone: payload.storePhone,
      latitude: payload.latitude,
      longitude: payload.longitude,
      businessHours: payload.businessHours,
      intro: payload.intro,
      photosJson: payload.photos,
      servicesJson: payload.services,
    },
  }
}

async function upsertApplication(userId, form, { submit = false } = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    const err = new Error('用户不存在')
    err.status = 404
    throw err
  }
  if (submit && !user.phone) {
    const err = new Error('请先绑定手机号后再提交入驻')
    err.status = 403
    throw err
  }

  let payload = parseOnboardingForm(form)
  if (submit) {
    payload = validateSubmitPayload(payload)
  }

  const merchantId = String(form.merchantId || '').trim()
  let existing = merchantId
    ? await loadOwnedMerchant(userId, merchantId, null)
    : await findIncompleteMerchantApplication(userId)

  if (existing?.merchant) {
    existing = { merchant: existing, store: existing.stores?.[0] }
  } else if (existing?.stores?.length) {
    existing = { merchant: existing, store: existing.stores[0] }
  } else {
    existing = null
  }

  if (existing?.merchant) {
    await assertCanEditApplication(existing.merchant)
    if (existing.merchant.ownerUserId !== userId) {
      const err = new Error('你已是其他商家的员工，请使用主账号提交入驻')
      err.status = 409
      throw err
    }
  } else {
    const staffElsewhere = await prisma.merchantStaff.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        merchant: { ownerUserId: { not: userId } },
      },
    })
    if (staffElsewhere) {
      const err = new Error('你已是其他商家的员工，请使用主账号提交入驻')
      err.status = 409
      throw err
    }
  }

  const now = new Date()
  const nextMerchantStatus = submit ? MERCHANT_STATUS.PENDING_AUDIT : MERCHANT_STATUS.DRAFT
  const nextStoreStatus = submit ? STORE_STATUS.PENDING_AUDIT : STORE_STATUS.DRAFT
  const agreedAt = submit && form.agreed ? now : undefined
  const { merchant: merchantData, store: storeData } = buildMerchantStoreData(payload)

  let merchant
  let store

  if (existing?.merchant && existing.merchant.ownerUserId === userId) {
    merchant = await prisma.merchant.update({
      where: { id: existing.merchant.id },
      data: {
        ...merchantData,
        status: nextMerchantStatus,
        submittedAt: submit ? now : existing.merchant.submittedAt,
        rejectReason: submit ? '' : existing.merchant.rejectReason,
        ...(agreedAt ? { agreedAt } : {}),
      },
    })
    store = await prisma.store.update({
      where: { id: existing.store.id },
      data: {
        ...storeData,
        status: nextStoreStatus,
      },
    })
  } else {
    const newMerchantId = newId('mer')
    const newStoreId = newId('store')
    merchant = await prisma.merchant.create({
      data: {
        id: newMerchantId,
        ownerUserId: userId,
        status: nextMerchantStatus,
        submittedAt: submit ? now : null,
        agreedAt: agreedAt || null,
        ...merchantData,
        stores: {
          create: {
            id: newStoreId,
            status: nextStoreStatus,
            ...storeData,
          },
        },
      },
    })
    store = await prisma.store.findUnique({ where: { id: newStoreId } })
  }

  return { merchant, store, user }
}

async function activateMerchant(merchantId, userId, storeId) {
  const now = new Date()
  await prisma.$transaction([
    prisma.merchant.update({
      where: { id: merchantId },
      data: {
        status: MERCHANT_STATUS.ACTIVE,
        approvedAt: now,
      },
    }),
    prisma.store.update({
      where: { id: storeId },
      data: { status: STORE_STATUS.ACTIVE },
    }),
    prisma.merchantStaff.upsert({
      where: {
        merchantId_userId: { merchantId, userId },
      },
      create: {
        id: newId('staff'),
        merchantId,
        userId,
        storeId,
        role: 'owner',
        status: 'ACTIVE',
      },
      update: {
        storeId,
        role: 'owner',
        status: 'ACTIVE',
      },
    }),
  ])
}

async function saveOnboardingDraft(userId, form) {
  const { merchant, store } = await upsertApplication(userId, form, { submit: false })
  return formatOnboardingProfile(merchant, store)
}

async function submitOnboarding(userId, form) {
  const { merchant, store, user } = await upsertApplication(userId, form, { submit: true })

  let session = null
  if (config.merchantAutoApprove) {
    await activateMerchant(merchant.id, userId, store.id)
    const refreshed = await prisma.merchant.findUnique({
      where: { id: merchant.id },
      include: { stores: { take: 1, orderBy: { createdAt: 'asc' } } },
    })
    session = await buildAuthSession(user)
    return {
      profile: formatOnboardingProfile(refreshed, refreshed.stores[0]),
      session,
    }
  }

  return {
    profile: formatOnboardingProfile(merchant, store),
    session: null,
  }
}

module.exports = {
  getOnboardingProfile,
  saveOnboardingDraft,
  submitOnboarding,
  formatOnboardingProfile,
  activateMerchant,
  listWorkbenchStoreEntries,
  beginNewStoreRegistration,
}
