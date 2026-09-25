/**
 * 官网登录 · 2026-09-02 老板定，2026-09-25 改口径
 *
 * 背景：微信案例转换工具的配额从「按 IP 20 次/天」改为按用户等级
 * （游客 1 次/天、登录 3 次/天）。账号体系复用辙见小程序商家账号——
 * 官网用手机号验证码登录即注册：手机号对上已有 user 就是同一个账号
 * （商家身份自动带上）；没注册过就建一个 phone-only 账号，将来此人
 * 首次登小程序时按手机号合并（bindPhone 里的冲突释放逻辑）。
 *
 * 账号口径（2026-09-25）：账号主键是 userId（由 openid 确定），手机号只是联系方式。
 * 手机号会被回收、可被冒用，所以：
 *   1. 已绑微信的账号不再允许用手机号登录，改走微信扫码（web-login-ticket.service）；
 *   2. 没绑微信的 phone-only 账号仍可用手机号登录，登录后引导绑定微信；
 *   3. 换号产生的旧账号不自动合并，走「验证旧号验证码 → 资产迁移 → 旧账号作废」。
 *
 * 验证码的存放与防刷见 sms-code.service.js（与小程序换绑手机号共用）。
 */

const { prisma } = require('../lib/prisma')
const { newId, maskPhone } = require('../lib/ids')
const {
  sendLoginCode,
  verifyLoginCode,
  resolveLoginDebugCode,
  _codeStore,
} = require('./sms-code.service')
const { buildAuthSession } = require('./auth.service')
const { mergePhoneOnlyAccount } = require('./account-merge.service')
const { clientIp, peekDailyUsage } = require('./geo-check-rate-limit')

const PER_IP_PER_DAY = 20

/**
 * 验证码校验（一次作废）+ 登录/注册。
 * @returns {Promise<{ok:true, session:object, isNewUser:boolean, phoneDisplay:string, needBindWechat:boolean} | {ok:false, code:string, message:string}>}
 */
async function loginWithCode(phone, code) {
  const mobile = String(phone || '').trim()
  const verified = verifyLoginCode(mobile, code)
  if (!verified.ok) return verified

  const found = await findOrCreateUserByPhone(mobile)
  if (!found.ok) return found

  const session = await buildAuthSession(found.user)
  return {
    ok: true,
    session,
    isNewUser: found.isNewUser,
    phoneDisplay: maskPhone(mobile),
    // 走到这里的都是 phone-only 账号：换号就会丢，登录后引导绑定微信
    needBindWechat: true,
  }
}

/**
 * 按手机号找 user。phone 字段没有唯一索引，历史数据可能出现多条：
 * 优先有 openid 的（真实微信账号），其次最新注册的。
 * 没有任何账号时创建 phone-only user（openid 为空，将来小程序首次登录时合并）。
 *
 * 命中「已绑微信」的账号直接拒绝：号码被回收后新号主人不该凭手机号登进去，
 * 这类账号必须用微信扫码登录。
 * @param {string} mobile
 * @returns {Promise<{ok:true, user:object, isNewUser:boolean} | {ok:false, code:string, message:string}>}
 */
async function findOrCreateUserByPhone(mobile) {
  const users = await prisma.user.findMany({
    where: { phone: mobile, status: 'ACTIVE' },
    orderBy: [{ createdAt: 'desc' }],
  })
  if (users.length) {
    const target = users.find((u) => Boolean(u.openid)) || users[0]
    if (target.openid) {
      return {
        ok: false,
        code: 'USE_WECHAT_LOGIN',
        message: '这个账号已经绑定微信，请用微信扫码登录',
      }
    }
    return { ok: true, user: target, isNewUser: false }
  }
  const user = await prisma.user.create({
    data: {
      id: newId('user'),
      phone: mobile,
      nickname: '',
    },
  })
  return { ok: true, user, isNewUser: true }
}

/**
 * 换号找回旧账号：验证旧手机号后，把旧账号资产迁到当前账号，旧账号作废。
 *
 * 只接受 phone-only 旧账号——绑过微信的账号请用微信登录，不凭手机号迁走。
 * @param {{ userId: string, oldPhone: string, code: string }} input
 * @returns {Promise<{ok:true, session:object} | {ok:false, code:string, message:string}>}
 */
async function recoverOldAccount({ userId, oldPhone, code } = {}) {
  if (!userId) return { ok: false, code: 'NOT_AUTHED', message: '请先登录' }

  const mobile = String(oldPhone || '').trim()
  const verified = verifyLoginCode(mobile, code)
  if (!verified.ok) return verified

  const old = await prisma.user.findFirst({
    where: { phone: mobile, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  })
  if (!old) return { ok: false, code: 'OLD_ACCOUNT_NOT_FOUND', message: '这个手机号没有对应账号' }
  if (old.id === userId) return { ok: false, code: 'SAME_ACCOUNT', message: '这就是当前账号' }

  await mergePhoneOnlyAccount({ fromUserId: old.id, toUserId: userId })

  const user = await prisma.user.findUnique({ where: { id: userId } })
  const session = await buildAuthSession(user)
  return { ok: true, session }
}

/** 登录用户今天还能发几条验证码（给前端倒计时/降级提示用，只看不扣） */
function peekIpSmsUsage(ip) {
  return peekDailyUsage(`sms-ip:${ip}`, 'sms-ip', PER_IP_PER_DAY)
}

module.exports = {
  sendLoginCode,
  loginWithCode,
  findOrCreateUserByPhone,
  recoverOldAccount,
  peekIpSmsUsage,
  clientIp,
  resolveLoginDebugCode,
  // 仅供冒烟测试检视内部状态
  _codeStore,
}
