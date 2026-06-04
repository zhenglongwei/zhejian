const { prisma } = require('../lib/prisma')
const { linkPendingStaffForUser, normalizeMobilePhone } = require('./merchant-staff.service')

const ACTIVE_MERCHANT_STATUS = 'ACTIVE'
const ACTIVE_STAFF_STATUS = 'ACTIVE'

const staffInclude = {
  merchant: { include: { stores: { take: 1, orderBy: { createdAt: 'asc' } } } },
}

function formatMerchantContext(staff) {
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

/**
 * 查询用户绑定的商家身份（同小程序：入驻审核通过后 staff 生效）
 * 员工：登录且绑定手机号与 invite_phone 一致时自动关联待激活记录
 * @param {string} userId
 */
async function resolveMerchantContext(userId) {
  if (!userId) return null

  let staff = await prisma.merchantStaff.findFirst({
    where: {
      userId,
      status: ACTIVE_STAFF_STATUS,
      merchant: { status: ACTIVE_MERCHANT_STATUS },
    },
    include: staffInclude,
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
        include: staffInclude,
      })
    }
  }

  if (!staff) return null
  return formatMerchantContext(staff)
}

module.exports = {
  resolveMerchantContext,
  ACTIVE_MERCHANT_STATUS,
  ACTIVE_STAFF_STATUS,
}
