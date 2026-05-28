const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { newId, toIso } = require('../lib/ids')
const {
  MERCHANT_STATUS,
  STORE_STATUS,
  toFrontStatus,
} = require('../constants/merchant')
const { buildAuthSession } = require('./auth.service')

function normalizeServices(services) {
  if (!Array.isArray(services)) return []
  return services
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 20)
}

function formatOnboardingProfile(merchant, store) {
  if (!merchant || !store) return null
  return {
    status: toFrontStatus(merchant.status),
    merchantId: merchant.id,
    storeId: store.id,
    storeName: store.name || merchant.name,
    contactName: merchant.contactName,
    phone: merchant.contactPhone || store.phone,
    address: store.address,
    services: Array.isArray(store.servicesJson) ? store.servicesJson : [],
    rejectReason: merchant.rejectReason || '',
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

function validateSubmitForm(form = {}) {
  const storeName = (form.storeName || '').trim()
  const contactName = (form.contactName || '').trim()
  const phone = (form.contactPhone || form.phone || '').trim()
  const address = (form.address || '').trim()
  const services = normalizeServices(form.services)

  if (!storeName || !contactName || !phone || !address) {
    const err = new Error('请填写完整入驻信息')
    err.status = 400
    throw err
  }
  if (!services.length) {
    const err = new Error('请至少选择一项擅长服务')
    err.status = 400
    throw err
  }
  return { storeName, contactName, phone, address, services }
}

function validateDraftForm(form = {}) {
  return {
    storeName: (form.storeName || '').trim(),
    contactName: (form.contactName || '').trim(),
    phone: (form.contactPhone || form.phone || '').trim(),
    address: (form.address || '').trim(),
    services: normalizeServices(form.services),
  }
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

  const payload = submit ? validateSubmitForm(form) : validateDraftForm(form)
  const existing = await findMerchantApplication(userId)

  if (existing?.merchant) {
    await assertCanEditApplication(existing.merchant)
  }

  const now = new Date()
  const nextMerchantStatus = submit ? MERCHANT_STATUS.PENDING_AUDIT : MERCHANT_STATUS.DRAFT
  const nextStoreStatus = submit ? STORE_STATUS.PENDING_AUDIT : STORE_STATUS.DRAFT

  let merchant
  let store

  if (existing?.merchant && existing.merchant.ownerUserId === userId) {
    merchant = await prisma.merchant.update({
      where: { id: existing.merchant.id },
      data: {
        name: payload.storeName || existing.merchant.name,
        contactName: payload.contactName,
        contactPhone: payload.phone,
        status: nextMerchantStatus,
        submittedAt: submit ? now : existing.merchant.submittedAt,
        rejectReason: '',
      },
    })
    store = await prisma.store.update({
      where: { id: existing.store.id },
      data: {
        name: payload.storeName || existing.store.name,
        address: payload.address,
        phone: payload.phone,
        servicesJson: payload.services,
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
        name: payload.storeName,
        ownerUserId: userId,
        contactName: payload.contactName,
        contactPhone: payload.phone,
        status: nextMerchantStatus,
        submittedAt: submit ? now : null,
        stores: {
          create: {
            id: storeId,
            name: payload.storeName,
            address: payload.address,
            phone: payload.phone,
            servicesJson: payload.services,
            status: nextStoreStatus,
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
