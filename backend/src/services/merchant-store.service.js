const { prisma } = require('../lib/prisma')
const { MERCHANT_STATUS, STORE_STATUS } = require('../constants/merchant')
const { formatOnboardingProfile } = require('./merchant-onboarding.service')
const {
  parseStoreDisplayForm,
  validateStoreDisplayPayload,
} = require('../lib/onboarding-payload')

const STAFF_ROLE_OWNER = 'owner'
const STAFF_STATUS_ACTIVE = 'ACTIVE'

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

async function updateStoreDisplayProfile(auth, rawForm = {}) {
  await assertMerchantOwner(auth)

  const storeId = String(rawForm.storeId || auth.storeId || '').trim()
  if (!storeId) {
    const err = new Error('未找到门店')
    err.status = 400
    throw err
  }

  await loadOwnedActiveStore(auth.merchantId, storeId)

  let payload = parseStoreDisplayForm(rawForm)
  payload = validateStoreDisplayPayload(payload)

  const updatedStore = await prisma.store.update({
    where: { id: storeId },
    data: {
      phone: payload.storePhone,
      businessHours: payload.businessHours,
      intro: payload.intro,
      servicesJson: payload.services,
      photosJson: payload.photos,
    },
  })

  const merchant = await prisma.merchant.findUnique({
    where: { id: auth.merchantId },
  })

  return formatOnboardingProfile(merchant, updatedStore)
}

module.exports = {
  updateStoreDisplayProfile,
  assertMerchantOwner,
}
