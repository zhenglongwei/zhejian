const { prisma } = require('../lib/prisma')
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
const {
  buildMerchantCapabilityEditorView,
  readBrandAuthItemsFromPhotos,
} = require('../utils/store-capability')
const { resolveStoreCapabilityJson } = require('../utils/store-capability-load')
const { resolveClientReadableMediaUrl } = require('../lib/media-storage')
const {
  ACCOUNT_TYPE,
  AUTH_STATUS,
  COMPLETENESS,
  scoreProfileCompleteness,
  evaluateAuthSubmission,
  buildPublisherTrustBadge,
} = require('../utils/merchant-trust')

/** 商家端 <image> 无法带 Bearer，读侧须返回新鲜 signed URL */
function resignBrandAuthItems(items) {
  return (items || []).map((item) => {
    if (!item || typeof item !== 'object') return item
    return {
      ...item,
      imageUrl: resolveClientReadableMediaUrl(item.imageUrl || ''),
    }
  })
}

function resignPhotoMap(photos = {}) {
  const receptionUrls = (
    Array.isArray(photos.receptionUrls)
      ? photos.receptionUrls
      : photos.receptionUrl
        ? [photos.receptionUrl]
        : []
  )
    .map((url) => resolveClientReadableMediaUrl(url))
    .filter(Boolean)
  const brandAuthItems = resignBrandAuthItems(
    readBrandAuthItemsFromPhotos(photos, photos.brandAuthValidUntil || '')
  )
  return {
    facadeUrl: resolveClientReadableMediaUrl(photos.facadeUrl || ''),
    workshopUrls: (photos.workshopUrls || [])
      .map((url) => resolveClientReadableMediaUrl(url))
      .filter(Boolean),
    receptionUrls,
    receptionUrl: receptionUrls[0] || '',
    brandAuthItems,
    brandAuthUrl: resolveClientReadableMediaUrl(
      brandAuthItems[0]?.imageUrl || photos.brandAuthUrl || ''
    ),
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
  const trust = buildPublisherTrustBadge(merchant, store)
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
    legalIdPhotoUrl: resolveClientReadableMediaUrl(merchant.legalIdPhotoUrl || ''),
    licenseEstablishedOn:
      merchant.licenseEstablishedOn instanceof Date
        ? merchant.licenseEstablishedOn.toISOString().slice(0, 10)
        : merchant.licenseEstablishedOn
          ? String(merchant.licenseEstablishedOn).slice(0, 10)
          : '',
    contactEmail: merchant.contactEmail || '',
    qualification,
    photos,
    specialtyBrands: capabilityEditor.specialtyBrands,
    notAccepting: capabilityEditor.notAccepting,
    technicians: resignTechnicians(capabilityEditor.technicians),
    equipmentTags: resignEquipmentTags(capabilityEditor.equipmentTags),
    brandAuthItems: resignBrandAuthItems(capabilityEditor.brandAuthItems),
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
    accountType: trust.accountType,
    authStatus: trust.authStatus,
    authStatusLabel: trust.authStatusLabel,
    profileCompleteness: trust.profileCompleteness,
    profileCompletenessLabel: trust.profileCompletenessLabel,
    publisherTrust: trust,
  }
}

const INCOMPLETE_MERCHANT_STATUSES = [
  MERCHANT_STATUS.DRAFT,
  MERCHANT_STATUS.PENDING_AUDIT,
  MERCHANT_STATUS.NEED_MODIFY,
  MERCHANT_STATUS.AUDIT_REJECTED,
]

/** 门店选择页允许商家自行删除的申请态（不含待审核 / 已通过） */
const DELETABLE_MERCHANT_STATUSES = [
  MERCHANT_STATUS.DRAFT,
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
        canDelete: DELETABLE_MERCHANT_STATUSES.includes(merchant.status),
      },
    ]
  })
}

/**
 * 主账号删除未通过审核的门店申请（草稿 / 需修改 / 已驳回）
 * 软关闭：主体 CLOSED，门店 OFFLINE，员工置 INACTIVE
 */
async function discardMerchantApplication(userId, merchantId) {
  const id = String(merchantId || '').trim()
  if (!id) {
    const err = new Error('缺少商家 ID')
    err.status = 400
    throw err
  }

  const merchant = await prisma.merchant.findFirst({
    where: {
      id,
      ownerUserId: userId,
      status: { not: MERCHANT_STATUS.CLOSED },
    },
  })
  if (!merchant) {
    const err = new Error('门店申请不存在')
    err.status = 404
    throw err
  }
  if (!DELETABLE_MERCHANT_STATUSES.includes(merchant.status)) {
    const err = new Error('仅草稿、需修改或已驳回的申请可删除')
    err.status = 409
    throw err
  }

  await prisma.$transaction([
    prisma.merchant.update({
      where: { id: merchant.id },
      data: { status: MERCHANT_STATUS.CLOSED },
    }),
    prisma.store.updateMany({
      where: { merchantId: merchant.id },
      data: { status: STORE_STATUS.OFFLINE },
    }),
    prisma.merchantStaff.updateMany({
      where: { merchantId: merchant.id, status: 'ACTIVE' },
      data: { status: 'INACTIVE' },
    }),
  ])

  return { ok: true, merchantId: merchant.id }
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
      licenseEstablishedOn: latestApproved?.licenseEstablishedOn || null,
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
    const err = new Error('已开通，请在门店资料或认证入口完善')
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
      licenseEstablishedOn: payload.licenseEstablishedOn
        ? new Date(`${payload.licenseEstablishedOn}T00:00:00.000Z`)
        : null,
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
  // 软信任：提交即 ACTIVE，不再进入 PENDING_AUDIT 门禁
  const nextMerchantStatus = submit ? MERCHANT_STATUS.ACTIVE : MERCHANT_STATUS.DRAFT
  const nextStoreStatus = submit ? STORE_STATUS.ACTIVE : STORE_STATUS.DRAFT
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

  // 软信任：提交完善资料后一律开通，不再依赖人工入驻审核门禁
  await activateMerchant(merchant.id, userId, store.id)
  await refreshMerchantCompleteness(merchant.id, store.id)
  const refreshed = await prisma.merchant.findUnique({
    where: { id: merchant.id },
    include: { stores: { take: 1, orderBy: { createdAt: 'asc' } } },
  })
  const session = await buildAuthSession(user)
  return {
    profile: formatOnboardingProfile(refreshed, refreshed.stores[0]),
    session,
  }
}

async function refreshMerchantCompleteness(merchantId, storeId) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } })
  const store = await prisma.store.findUnique({ where: { id: storeId } })
  if (!merchant || !store) return null
  const tier = scoreProfileCompleteness(merchant, store)
  if (tier === merchant.profileCompleteness) return tier
  await prisma.merchant.update({
    where: { id: merchantId },
    data: { profileCompleteness: tier },
  })
  return tier
}

/**
 * 一键开通商家账号：立刻 ACTIVE，可生产
 */
async function quickOpenMerchant(userId, { storeName = '' } = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    const err = new Error('用户不存在')
    err.status = 404
    throw err
  }

  const existingActive = await prisma.merchant.findFirst({
    where: { ownerUserId: userId, status: MERCHANT_STATUS.ACTIVE },
    include: { stores: { orderBy: { createdAt: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  })
  if (existingActive?.stores?.length) {
    const session = await buildAuthSession(user)
    return {
      profile: formatOnboardingProfile(existingActive, existingActive.stores[0]),
      session,
      alreadyOpen: true,
    }
  }

  // 若有草稿申请，直接升为 ACTIVE
  const incomplete = await findIncompleteMerchantApplication(userId)
  if (incomplete?.stores?.length) {
    const store = incomplete.stores[0]
    const name = String(storeName || store.name || incomplete.name || '我的门店').trim() || '我的门店'
    await prisma.merchant.update({
      where: { id: incomplete.id },
      data: {
        name,
        accountType: ACCOUNT_TYPE.MERCHANT,
        status: MERCHANT_STATUS.ACTIVE,
        approvedAt: new Date(),
        profileCompleteness: scoreProfileCompleteness(incomplete, { ...store, name }),
      },
    })
    await prisma.store.update({
      where: { id: store.id },
      data: { status: STORE_STATUS.ACTIVE, name: store.name || name },
    })
    await activateMerchant(incomplete.id, userId, store.id)
    const refreshed = await prisma.merchant.findUnique({
      where: { id: incomplete.id },
      include: { stores: { orderBy: { createdAt: 'asc' } } },
    })
    const session = await buildAuthSession(user)
    return {
      profile: formatOnboardingProfile(refreshed, refreshed.stores[0]),
      session,
      alreadyOpen: false,
    }
  }

  const staffElsewhere = await prisma.merchantStaff.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      merchant: { ownerUserId: { not: userId } },
    },
  })
  if (staffElsewhere) {
    const err = new Error('你已是其他商家的员工，请使用主账号开通')
    err.status = 409
    throw err
  }

  const merchantId = newId('mer')
  const storeId = newId('store')
  const name = String(storeName || user.nickname || '我的门店').trim() || '我的门店'
  const now = new Date()
  await prisma.merchant.create({
    data: {
      id: merchantId,
      ownerUserId: userId,
      name,
      accountType: ACCOUNT_TYPE.MERCHANT,
      authStatus: AUTH_STATUS.NONE,
      profileCompleteness: COMPLETENESS.BASIC,
      status: MERCHANT_STATUS.ACTIVE,
      contactPhone: user.phone || '',
      approvedAt: now,
      stores: {
        create: {
          id: storeId,
          name,
          status: STORE_STATUS.ACTIVE,
          phone: user.phone || '',
        },
      },
    },
  })
  await activateMerchant(merchantId, userId, storeId)
  const refreshed = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: { stores: { orderBy: { createdAt: 'asc' } } },
  })
  await refreshMerchantCompleteness(merchantId, storeId)
  const again = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: { stores: { orderBy: { createdAt: 'asc' } } },
  })
  const session = await buildAuthSession(user)
  return {
    profile: formatOnboardingProfile(again || refreshed, (again || refreshed).stores[0]),
    session,
    alreadyOpen: false,
  }
}

/**
 * 可选认证：上传执照 + 法人身份证，自动校验
 */
async function submitMerchantAuth(userId, body = {}) {
  const merchantId = String(body.merchantId || '').trim()
  const where = merchantId
    ? { id: merchantId, ownerUserId: userId, status: { not: MERCHANT_STATUS.CLOSED } }
    : { ownerUserId: userId, status: MERCHANT_STATUS.ACTIVE }
  const merchant = await prisma.merchant.findFirst({
    where,
    include: { stores: { orderBy: { createdAt: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  })
  if (!merchant?.stores?.length) {
    const err = new Error('请先开通商家账号')
    err.status = 404
    throw err
  }
  const store = merchant.stores[0]
  const licensePhotoUrl = String(body.licensePhotoUrl || merchant.licensePhotoUrl || '').trim()
  const legalIdPhotoUrl = String(body.legalIdPhotoUrl || merchant.legalIdPhotoUrl || '').trim()
  const legalName = String(body.legalName || merchant.legalName || '').trim()
  const creditCode = String(body.creditCode || merchant.creditCode || '').trim()
  const evalResult = evaluateAuthSubmission({
    licensePhotoUrl,
    legalIdPhotoUrl,
    legalName,
    creditCode,
  })
  const now = new Date()
  const updated = await prisma.merchant.update({
    where: { id: merchant.id },
    data: {
      licensePhotoUrl,
      legalIdPhotoUrl,
      legalName,
      creditCode,
      authStatus: evalResult.authStatus,
      authVerifiedAt: evalResult.authStatus === AUTH_STATUS.VERIFIED ? now : null,
      name: legalName || merchant.name,
      profileCompleteness: scoreProfileCompleteness(
        { ...merchant, legalName, creditCode, licensePhotoUrl, legalIdPhotoUrl },
        store,
      ),
    },
    include: { stores: { orderBy: { createdAt: 'asc' } } },
  })
  if (evalResult.authStatus === AUTH_STATUS.FAILED) {
    const err = new Error(evalResult.reason || '认证校验未通过')
    err.status = 400
    err.code = 'AUTH_FAILED'
    err.profile = formatOnboardingProfile(updated, updated.stores[0])
    throw err
  }
  return {
    profile: formatOnboardingProfile(updated, updated.stores[0]),
    message:
      evalResult.authStatus === AUTH_STATUS.VERIFIED
        ? '认证已通过'
        : evalResult.reason || '认证已提交',
  }
}

/**
 * 运营撤销认证标
 */
async function revokeMerchantAuth(merchantId, { reason = '' } = {}) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: { stores: { orderBy: { createdAt: 'asc' } } },
  })
  if (!merchant) {
    const err = new Error('商家不存在')
    err.status = 404
    throw err
  }
  const updated = await prisma.merchant.update({
    where: { id: merchantId },
    data: {
      authStatus: AUTH_STATUS.NONE,
      authVerifiedAt: null,
      rejectReason: reason ? String(reason).slice(0, 200) : merchant.rejectReason,
    },
    include: { stores: { orderBy: { createdAt: 'asc' } } },
  })
  return formatOnboardingProfile(updated, updated.stores[0])
}

module.exports = {
  getOnboardingProfile,
  saveOnboardingDraft,
  submitOnboarding,
  formatOnboardingProfile,
  activateMerchant,
  listWorkbenchStoreEntries,
  beginNewStoreRegistration,
  discardMerchantApplication,
  quickOpenMerchant,
  submitMerchantAuth,
  revokeMerchantAuth,
  refreshMerchantCompleteness,
}
