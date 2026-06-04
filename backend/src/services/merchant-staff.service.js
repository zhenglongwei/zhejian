const { prisma } = require('../lib/prisma')
const { newId, maskPhone } = require('../lib/ids')
const ACTIVE_MERCHANT_STATUS = 'ACTIVE'

const STAFF_ROLE_OWNER = 'owner'
const STAFF_ROLE_MEMBER = 'staff'
const STAFF_STATUS_ACTIVE = 'ACTIVE'
const STAFF_STATUS_INACTIVE = 'INACTIVE'
const MAX_ACTIVE_STAFF = 8

function normalizeMobilePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits.length === 11 ? digits : ''
}

function formatStaffItem(row, viewerUserId) {
  const linked = Boolean(row.userId)
  const phone = row.invitePhone || row.user?.phone || ''
  return {
    id: row.id,
    userId: row.userId || '',
    role: row.role,
    roleLabel: row.role === STAFF_ROLE_OWNER ? '管理员' : '员工',
    nickname: linked ? (row.user?.nickname || '微信用户') : '待登录',
    phoneDisplay: phone ? maskPhone(phone) : '—',
    pending: !linked,
    isSelf: linked && row.userId === viewerUserId,
    canRemove: row.role === STAFF_ROLE_MEMBER,
  }
}

async function assertStaffMemberSlot(merchantId) {
  const activeMembers = await prisma.merchantStaff.count({
    where: {
      merchantId,
      status: STAFF_STATUS_ACTIVE,
      role: STAFF_ROLE_MEMBER,
    },
  })
  if (activeMembers >= MAX_ACTIVE_STAFF) {
    const err = new Error(`最多添加 ${MAX_ACTIVE_STAFF} 名员工`)
    err.status = 409
    throw err
  }
}

async function assertCanAssignStaffUser(targetUserId, merchantId) {
  if (!targetUserId) return

  const ownsOtherMerchant = await prisma.merchant.findFirst({
    where: {
      ownerUserId: targetUserId,
      id: { not: merchantId },
      status: { not: 'CLOSED' },
    },
  })
  if (ownsOtherMerchant) {
    const err = new Error('该手机号对应用户已是其他店铺管理员，无法添加为员工')
    err.status = 409
    throw err
  }

  const staffElsewhere = await prisma.merchantStaff.findFirst({
    where: {
      userId: targetUserId,
      status: STAFF_STATUS_ACTIVE,
      merchantId: { not: merchantId },
    },
  })
  if (staffElsewhere) {
    const err = new Error('该手机号对应用户已是其他店铺员工')
    err.status = 409
    throw err
  }
}

/**
 * 用户绑定手机号后，将待激活邀请关联到 user_id
 */
async function linkPendingStaffForUser(userId, phone) {
  const normalized = normalizeMobilePhone(phone)
  if (!userId || !normalized) return null

  const pending = await prisma.merchantStaff.findFirst({
    where: {
      invitePhone: normalized,
      userId: null,
      status: STAFF_STATUS_ACTIVE,
      role: STAFF_ROLE_MEMBER,
      merchant: { status: ACTIVE_MERCHANT_STATUS },
    },
  })
  if (!pending) return null

  await assertCanAssignStaffUser(userId, pending.merchantId)

  const conflict = await prisma.merchantStaff.findFirst({
    where: {
      merchantId: pending.merchantId,
      userId,
      status: STAFF_STATUS_ACTIVE,
      id: { not: pending.id },
    },
  })
  if (conflict) return conflict

  return prisma.merchantStaff.update({
    where: { id: pending.id },
    data: { userId },
  })
}

async function resolveOwnerStaff(auth) {
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
      select: { ownerUserId: true },
    })
    if (!merchant || merchant.ownerUserId !== userId) {
      const err = new Error('仅店铺管理员可管理员工')
      err.status = 403
      throw err
    }
  }

  return { merchantId, userId }
}

async function listMerchantStaff(auth) {
  const { merchantId } = await resolveOwnerStaff(auth)

  const rows = await prisma.merchantStaff.findMany({
    where: {
      merchantId,
      status: STAFF_STATUS_ACTIVE,
    },
    include: { user: true },
    orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
  })

  return {
    list: rows.map((row) => formatStaffItem(row, auth.userId)),
    maxStaff: MAX_ACTIVE_STAFF,
    memberCount: rows.filter((r) => r.role === STAFF_ROLE_MEMBER).length,
  }
}

async function inviteMerchantStaff(auth, rawPhone) {
  const { merchantId, userId: operatorUserId } = await resolveOwnerStaff(auth)
  const phone = normalizeMobilePhone(rawPhone)
  if (!phone) {
    const err = new Error('请输入 11 位手机号')
    err.status = 400
    throw err
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { ownerUserId: true, contactPhone: true },
  })
  const ownerUser = merchant?.ownerUserId
    ? await prisma.user.findUnique({ where: { id: merchant.ownerUserId } })
    : null
  const ownerPhones = [normalizeMobilePhone(merchant?.contactPhone), normalizeMobilePhone(ownerUser?.phone)].filter(
    Boolean
  )
  if (ownerPhones.includes(phone)) {
    const err = new Error('不能将管理员本人手机号添加为员工')
    err.status = 400
    throw err
  }

  const duplicate = await prisma.merchantStaff.findFirst({
    where: {
      merchantId,
      invitePhone: phone,
      status: STAFF_STATUS_ACTIVE,
    },
  })
  if (duplicate) {
    const err = new Error('该手机号已在员工列表中')
    err.status = 409
    throw err
  }

  await assertStaffMemberSlot(merchantId)

  const existingUser = await prisma.user.findFirst({ where: { phone } })
  if (existingUser) {
    if (existingUser.id === operatorUserId) {
      const err = new Error('不能添加自己为员工')
      err.status = 400
      throw err
    }
    await assertCanAssignStaffUser(existingUser.id, merchantId)
  }

  const storeId = auth.storeId || ''
  const row = await prisma.merchantStaff.create({
    data: {
      id: newId('staff'),
      merchantId,
      userId: existingUser ? existingUser.id : null,
      invitePhone: phone,
      storeId,
      role: STAFF_ROLE_MEMBER,
      status: STAFF_STATUS_ACTIVE,
    },
    include: { user: true },
  })

  const hint = existingUser
    ? '已关联该用户，对方重新进入小程序即可使用商家工作台'
    : '已登记手机号；对方用该号登录并绑定手机后，在「我的」进入商家工作台'

  return {
    item: formatStaffItem(row, operatorUserId),
    hint,
  }
}

async function removeMerchantStaff(auth, staffId) {
  const { merchantId } = await resolveOwnerStaff(auth)
  if (!staffId) {
    const err = new Error('参数错误')
    err.status = 400
    throw err
  }

  const row = await prisma.merchantStaff.findFirst({
    where: { id: staffId, merchantId },
    include: { user: true },
  })
  if (!row || row.status !== STAFF_STATUS_ACTIVE) {
    const err = new Error('员工不存在')
    err.status = 404
    throw err
  }
  if (row.role === STAFF_ROLE_OWNER) {
    const err = new Error('不能移除店铺管理员')
    err.status = 400
    throw err
  }

  await prisma.merchantStaff.update({
    where: { id: staffId },
    data: { status: STAFF_STATUS_INACTIVE },
  })

  return { ok: true }
}

module.exports = {
  listMerchantStaff,
  inviteMerchantStaff,
  removeMerchantStaff,
  linkPendingStaffForUser,
  normalizeMobilePhone,
  MAX_ACTIVE_STAFF,
  STAFF_ROLE_OWNER,
  STAFF_ROLE_MEMBER,
}
