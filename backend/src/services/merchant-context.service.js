const { prisma } = require('../lib/prisma')
const { linkPendingStaffForUser, normalizeMobilePhone } = require('./merchant-staff.service')

const { STORE_STATUS } = require('../constants/merchant')

const ACTIVE_MERCHANT_STATUS = 'ACTIVE'
const ACTIVE_STAFF_STATUS = 'ACTIVE'

async function loadActiveStoreForMerchant(merchantId, storeId) {
  if (!storeId) return null
  return prisma.store.findFirst({
    where: {
      id: storeId,
      merchantId,
      status: STORE_STATUS.ACTIVE,
    },
  })
}

async function resolveStoreIdForStaff(staff, preferredStoreId = '') {
  const merchantId = staff.merchantId
  const stores = staff.merchant.stores || []

  if (staff.role !== 'owner' && staff.storeId) {
    const locked = await loadActiveStoreForMerchant(merchantId, staff.storeId)
    if (locked) return locked.id
  }

  const preferred = String(preferredStoreId || '').trim()
  if (preferred) {
    const picked = await loadActiveStoreForMerchant(merchantId, preferred)
    if (picked) return picked.id
  }

  if (staff.storeId) {
    const fromStaff = await loadActiveStoreForMerchant(merchantId, staff.storeId)
    if (fromStaff) return fromStaff.id
  }

  const first = stores.find((s) => s.status === STORE_STATUS.ACTIVE) || stores[0]
  return first ? first.id : ''
}

function formatMerchantContext(staff, storeId) {
  return {
    merchantId: staff.merchantId,
    storeId: storeId || '',
    staffRole: staff.role,
    merchantStatus: staff.merchant.status,
  }
}

const STAFF_INCLUDE = {
  merchant: {
    include: {
      stores: { where: { status: STORE_STATUS.ACTIVE }, orderBy: { createdAt: 'asc' } },
    },
  },
}

async function loadActiveStaffRecords(userId) {
  return prisma.merchantStaff.findMany({
    where: {
      userId,
      status: ACTIVE_STAFF_STATUS,
      merchant: { status: ACTIVE_MERCHANT_STATUS },
    },
    include: STAFF_INCLUDE,
    orderBy: { updatedAt: 'desc' },
  })
}

function pickStaffRecord(staffRecords, options = {}) {
  if (!staffRecords.length) return null
  const preferredMerchantId = String(options.merchantId || '').trim()
  const preferredStoreId = String(options.storeId || '').trim()

  if (preferredStoreId) {
    const byStore = staffRecords.find((staff) =>
      (staff.merchant.stores || []).some((store) => store.id === preferredStoreId)
    )
    if (byStore) return byStore
  }

  if (preferredMerchantId) {
    const byMerchant = staffRecords.find((staff) => staff.merchantId === preferredMerchantId)
    if (byMerchant) return byMerchant
  }

  return staffRecords[0]
}

/**
 * 查询用户绑定的商家身份（同小程序：入驻审核通过后 staff 生效）
 * @param {string} userId
 * @param {{ merchantId?: string, storeId?: string }} [options] — JWT 当前商家/门店；owner 可切换，staff 锁定本店
 */
async function resolveMerchantContext(userId, options = {}) {
  if (!userId) return null

  let staffRecords = await loadActiveStaffRecords(userId)

  if (!staffRecords.length) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const phone = normalizeMobilePhone(user?.phone)
    if (phone) {
      await linkPendingStaffForUser(userId, phone)
      staffRecords = await loadActiveStaffRecords(userId)
    }
  }

  const staff = pickStaffRecord(staffRecords, options)
  if (!staff) return null
  const storeId = await resolveStoreIdForStaff(staff, options.storeId)
  return formatMerchantContext(staff, storeId)
}

async function listMerchantStoresForUser(userId, merchantId, preferredStoreId = '') {
  const ctx = await resolveMerchantContext(userId, { storeId: preferredStoreId })
  if (!ctx || ctx.merchantId !== merchantId) return []

  const stores = await prisma.store.findMany({
    where: { merchantId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, address: true },
  })

  if (ctx.staffRole !== 'owner') {
    return stores.filter((s) => s.id === ctx.storeId)
  }
  return stores
}

async function userOwnsMerchantStore(userId, storeId) {
  const storeIdText = String(storeId || '').trim()
  if (!userId || !storeIdText) return null

  const store = await prisma.store.findUnique({
    where: { id: storeIdText },
    include: { merchant: true },
  })
  if (!store?.merchant) return null

  if (store.merchant.ownerUserId === userId) {
    return { merchant: store.merchant, store }
  }

  const staff = await prisma.merchantStaff.findFirst({
    where: {
      userId,
      merchantId: store.merchantId,
      status: ACTIVE_STAFF_STATUS,
      role: 'owner',
    },
  })
  if (!staff) return null
  return { merchant: store.merchant, store }
}

module.exports = {
  resolveMerchantContext,
  listMerchantStoresForUser,
  resolveStoreIdForStaff,
  loadActiveStoreForMerchant,
  userOwnsMerchantStore,
  ACTIVE_MERCHANT_STATUS,
  ACTIVE_STAFF_STATUS,
}
