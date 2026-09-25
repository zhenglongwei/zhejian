/**
 * 账号迁移：把 phone-only 账号的资产转到目标账号，旧账号作废 · 2026-09-25
 *
 * 背景：账号主键是 userId（由微信 openid 确定），手机号只是联系方式。官网手机号
 * 登录即注册，换号或用新号登录都会新建 phone-only 账号，旧账号的相册/案例等资产
 * 留在旧账号里。不按手机号自动合并（号码会被回收、可冒用），只在用户主动发起、
 * 且验证过旧号验证码或微信扫码确认后，把旧账号资产迁到当前账号，旧账号作废。
 *
 * 只处理 phone-only 账号（openid 为空）：有微信身份的账号必须走微信登录，
 * 不能凭手机号被迁走。
 *
 * 版本：v1 2026-09-25
 * 更新：2026-09-25 初版，服务官网「换号找回旧账号」与「绑定微信」两个场景
 */

const { prisma } = require('../lib/prisma')
const { USER_STATUS } = require('../constants/user')

/** 只按 userId 关联、直接改字段就能迁走的表 */
const SIMPLE_MOVE_TABLES = [
  'order',
  'consultLead',
  'authorizationLog',
  'contentReport',
  'userSearchHistory',
  'userFavorite',
  'userVehicle',
  'serviceAlbumFeedback',
  'serviceAlbumReview',
  'serviceAlbumPartVerification',
  'albumShareToken',
  'albumInspectionReport',
  'notificationSubscription',
  'eventTrackingLog',
  'merchantPaymentOrder',
]

function fail(message, status) {
  const err = new Error(message)
  err.status = status
  return err
}

/**
 * 迁移资产。相册额外改 userPhone：号码被回收后，新号主人不能凭 userPhone 认领到
 * 这些相册（与 auth.changePhone 的处理一致）。
 * @param {object} tx 事务句柄
 * @param {string} fromUserId 旧账号
 * @param {string} toUserId 目标账号
 * @param {string} fromPhone 旧账号手机号（员工邀请记录里若用旧号，一并改掉）
 * @param {string} toPhone 目标账号手机号
 * @returns {Promise<Record<string, number>>} 各表迁移条数
 */
async function moveAssets(tx, fromUserId, toUserId, fromPhone, toPhone) {
  const moved = {}

  moved.album = (
    await tx.album.updateMany({
      where: { userId: fromUserId },
      data: { userId: toUserId, userPhone: toPhone },
    })
  ).count

  for (const table of SIMPLE_MOVE_TABLES) {
    const res = await tx[table].updateMany({
      where: { userId: fromUserId },
      data: { userId: toUserId },
    })
    moved[table] = res.count
  }

  // 员工身份：目标账号已是同一家企业员工时，旧账号那条直接删掉，避免孤儿指向作废账号
  const staffRows = await tx.merchantStaff.findMany({ where: { userId: fromUserId } })
  let staffMoved = 0
  for (const row of staffRows) {
    const duplicate = await tx.merchantStaff.findUnique({
      where: { merchantId_userId: { merchantId: row.merchantId, userId: toUserId } },
    })
    if (duplicate) {
      await tx.merchantStaff.delete({ where: { id: row.id } })
      continue
    }
    await tx.merchantStaff.update({
      where: { id: row.id },
      data: {
        userId: toUserId,
        invitePhone: row.invitePhone === fromPhone ? toPhone : row.invitePhone,
      },
    })
    staffMoved += 1
  }
  moved.merchantStaff = staffMoved

  moved.merchantOwner = (
    await tx.merchant.updateMany({
      where: { ownerUserId: fromUserId },
      data: { ownerUserId: toUserId },
    })
  ).count

  return moved
}

/**
 * 作废旧账号：状态置 MERGED，并清空手机号与微信身份。手机号必须清——否则号码被
 * 回收后新号主人登录会命中这个作废账号；openid/unionid 必须清——唯一索引，留着会
 * 挡住目标账号将来绑定同一个微信身份。
 * @param {object} tx 事务句柄
 * @param {string} userId 旧账号
 */
async function retireOldAccount(tx, userId) {
  await tx.user.update({
    where: { id: userId },
    data: {
      status: USER_STATUS.MERGED,
      cancelledAt: new Date(),
      openid: null,
      unionid: null,
      phone: '',
      nickname: '',
      avatarUrl: '',
    },
  })
}

/**
 * 把 phone-only 账号的资产迁到目标账号并作废旧账号。
 * @param {{ fromUserId: string, toUserId: string }} input
 * @returns {Promise<{ ok: true, moved: Record<string, number> }>}
 */
async function mergePhoneOnlyAccount({ fromUserId, toUserId } = {}) {
  if (!fromUserId || !toUserId) throw fail('缺少账号', 400)
  if (fromUserId === toUserId) throw fail('不能迁到同一个账号', 400)

  const [from, to] = await Promise.all([
    prisma.user.findUnique({ where: { id: fromUserId } }),
    prisma.user.findUnique({ where: { id: toUserId } }),
  ])
  if (!from || from.status !== USER_STATUS.ACTIVE) throw fail('旧账号不存在', 404)
  if (!to || to.status !== USER_STATUS.ACTIVE) throw fail('当前账号不存在', 404)
  if (from.openid) throw fail('旧账号已绑定微信，请用微信扫码登录', 409)

  const fromPhone = from.phone || ''
  const toPhone = to.phone || ''

  return prisma.$transaction(async (tx) => {
    const moved = await moveAssets(tx, from.id, to.id, fromPhone, toPhone)
    await retireOldAccount(tx, from.id)
    return { ok: true, moved }
  })
}

module.exports = {
  mergePhoneOnlyAccount,
}
