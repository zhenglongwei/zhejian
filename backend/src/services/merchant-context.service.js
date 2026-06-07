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

/**
 * 查询用户绑定的商家身份（同小程序：入驻审核通过后 staff 生效）
 * @param {string} userId
 * @param {{ storeId?: string }} [options] — JWT 当前门店；owner 可切换，staff 锁定本店
 */
async function resolveMerchantContext(userId, options = {}) {
  if (!userId) return null

  let staff = await prisma.merchantStaff.findFirst({
    where: {
      userId,
      status: ACTIVE_STAFF_STATUS,
      merchant: { status: ACTIVE_MERCHANT_STATUS },
    },
    include: {
      merchant: {
        include: {
          stores: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
        },
      },
    },
  })

  if (!staff) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const phone = normalizeMobilePhone(user?.phone)
    if (phone) {
      await linkPendingStaffForUser(userId, phone)
      staff = await prisma.merchantStaff.findFirst({
        where: {
          userId,
          status: ACTIVE_STAFF_STATUS,
          merchant: { status: ACTIVE_MERCHANT_STATUS },
        },
        include: {
          merchant: {
            include: {
              stores: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
            },
          },
        },
      })
    }
  }

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

module.exports = {
  resolveMerchantContext,
  listMerchantStoresForUser,
  resolveStoreIdForStaff,
  ACTIVE_MERCHANT_STATUS,
  ACTIVE_STAFF_STATUS,
}
