const { prisma } = require('../lib/prisma')

const ACTIVE_MERCHANT_STATUS = 'ACTIVE'
const ACTIVE_STAFF_STATUS = 'ACTIVE'

/**
 * 查询用户绑定的商家身份（同小程序：入驻审核通过后 staff 生效）
 * @param {string} userId
 */
async function resolveMerchantContext(userId) {
  if (!userId) return null

  const staff = await prisma.merchantStaff.findFirst({
    where: {
      userId,
      status: ACTIVE_STAFF_STATUS,
      merchant: { status: ACTIVE_MERCHANT_STATUS },
    },
    include: {
      merchant: { include: { stores: { take: 1, orderBy: { createdAt: 'asc' } } } },
    },
  })

  if (!staff) return null

  const storeId =
    staff.storeId ||
    staff.merchant.stores[0]?.id ||
    ''

  return {
    merchantId: staff.merchantId,
    storeId,
    staffRole: staff.role,
    merchantStatus: staff.merchant.status,
  }
}

module.exports = {
  resolveMerchantContext,
  ACTIVE_MERCHANT_STATUS,
  ACTIVE_STAFF_STATUS,
}
