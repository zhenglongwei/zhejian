const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { newId, toIso } = require('../lib/ids')
const {
  MERCHANT_STATUS,
  STORE_STATUS,
  toFrontStatus,
} = require('../constants/merchant')
const { buildAuthSession } = require('./auth.service')
const {
  parseOnboardingForm,
  validateSubmitPayload,
  formatQualificationForClient,
  formatPhotosForClient,
} = require('../lib/onboarding-payload')

function formatOnboardingProfile(merchant, store) {
  if (!merchant || !store) return null
  const photos = formatPhotosForClient(store.photosJson)
  const qualification = formatQualificationForClient(merchant.qualificationJson)
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
    licensePhotoUrl: merchant.licensePhotoUrl || '',
    contactEmail: merchant.contactEmail || '',
    qualification,
    photos,
    rejectReason: merchant.rejectReason || '',
    agreedAt: toIso(merchant.agreedAt),
    submittedAt: toIso(merchant.submittedAt),
    approvedAt: toIso(merchant.approvedAt),
  }
}

async function findMerchantApplication(userId) {
  const staff = await prisma.merchantStaff.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: {
      merchant: { include: { stores: { take: 1, orderBy: { createdAt: 'asc' } } } },
    },
  })
  if (staff?.merchant) {
    const store = staff.merchant.stores[0]
    if (store) {
      return { merchant: staff.merchant, store }
    }
  }

  const merchant = await prisma.merchant.findFirst({
    where: {
      ownerUserId: userId,
      status: { not: MERCHANT_STATUS.CLOSED },
    },
    include: { stores: { take: 1, orderBy: { createdAt: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  })
  if (!merchant || !merchant.stores[0]) return null
  return { merchant, store: merchant.stores[0] }
}

async function getOnboardingProfile(userId) {
  const found = await findMerchantApplication(userId)
  if (!found) return null
  return formatOnboardingProfile(found.merchant, found.store)
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

  const existing = await findMerchantApplication(userId)

  if (existing?.merchant) {
    await assertCanEditApplication(existing.merchant)
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
  } else if (existing?.merchant) {
    const err = new Error('你已是其他商家的员工，请使用主账号提交入驻')
    err.status = 409
    throw err
  } else {
    const merchantId = newId('mer')
    const storeId = newId('store')
    merchant = await prisma.merchant.create({
      data: {
        id: merchantId,
        ownerUserId: userId,
        status: nextMerchantStatus,
        submittedAt: submit ? now : null,
        agreedAt: agreedAt || null,
        ...merchantData,
        stores: {
          create: {
            id: storeId,
            status: nextStoreStatus,
            ...storeData,
          },
        },
      },
    })
    store = await prisma.store.findUnique({ where: { id: storeId } })
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
}
