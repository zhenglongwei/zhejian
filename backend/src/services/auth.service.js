const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { newId, maskPhone } = require('../lib/ids')
const { signSessionToken, ROLES } = require('../lib/jwt')
const { code2Session, getPhoneNumber } = require('../lib/wechat')
const { USER_STATUS } = require('../constants/user')
const { stripUrlQuery } = require('../lib/media-signed-url')
const { resolveClientReadableMediaUrl } = require('../lib/media-storage')
const { resolveMerchantContext } = require('./merchant-context.service')
const { linkPendingStaffForUser } = require('./merchant-staff.service')
const {
  listUserRecentServiceAlbums,
  countUserServiceAlbumBindings,
} = require('./service-album.service')

const MINE_RECENT_ALBUMS_LIMIT = 3

function normalizeStoredAvatarUrl(url) {
  return stripUrlQuery(String(url || '').trim()).slice(0, 512)
}

function formatUserPayload(user) {
  const phone = user.phone || ''
  return {
    userId: user.id,
    nickname: user.nickname || '',
    avatarUrl: resolveClientReadableMediaUrl(user.avatarUrl || ''),
    phoneDisplay: phone ? maskPhone(phone) : '',
    isPhoneBound: Boolean(phone),
  }
}

function formatMerchantPayload(merchantCtx) {
  if (!merchantCtx) return null
  return {
    merchantId: merchantCtx.merchantId,
    storeId: merchantCtx.storeId,
    staffRole: merchantCtx.staffRole,
    status: merchantCtx.merchantStatus,
  }
}

async function buildAuthSession(user, options = {}) {
  const merchantCtx = await resolveMerchantContext(user.id, {
    merchantId: options.merchantId || '',
    storeId: options.storeId || '',
  })
  const roles = [ROLES.USER]
  if (merchantCtx) roles.push(ROLES.MERCHANT)

  if (!config.jwt.secret) {
    const err = new Error('JWT 未配置，请设置 JWT_SECRET')
    err.status = 500
    throw err
  }

  return {
    token: signSessionToken({
      userId: user.id,
      roles,
      merchantId: merchantCtx?.merchantId,
      storeId: merchantCtx?.storeId,
    }),
    user: formatUserPayload(user),
    roles,
    merchant: formatMerchantPayload(merchantCtx),
  }
}

async function devWechatLogin() {
  if (!config.devAuthEnabled) {
    const err = new Error('微信登录暂未开放')
    err.status = 503
    throw err
  }

  const userId = 'user_demo_1'
  const dbUser = await prisma.user.findUnique({ where: { id: userId } })
  if (!dbUser) {
    const err = new Error('演示用户不存在，请先执行 npm run db:seed')
    err.status = 500
    throw err
  }

  const merchantCtx = await resolveMerchantContext(userId)
  return {
    token: config.devTokens.user,
    user: formatUserPayload(dbUser),
    roles: merchantCtx ? [ROLES.USER, ROLES.MERCHANT] : [ROLES.USER],
    merchant: formatMerchantPayload(merchantCtx),
  }
}

async function wechatLogin(code) {
  const canRealWechat =
    config.wechat.configured && config.jwt.secret && Boolean(code)

  if (canRealWechat) {
    return realWechatLogin(code)
  }

  // 联调期：微信/JWT 未配齐时，真机有 code 也走 dev 桩（与 B-INF 冒烟一致）
  if (config.devAuthEnabled) {
    return devWechatLogin()
  }

  if (!config.wechat.configured) {
    const err = new Error('微信登录未配置，请在服务器 backend/.env 设置 WECHAT_APP_SECRET')
    err.status = 503
    throw err
  }

  if (!config.jwt.secret) {
    const err = new Error('JWT 未配置，请在服务器 backend/.env 设置 JWT_SECRET')
    err.status = 503
    throw err
  }

  const err = new Error('缺少微信登录凭证，请重试')
  err.status = 400
  throw err
}

async function realWechatLogin(code) {
  const session = await code2Session(code)
  const { openid, unionid } = session

  let user = await prisma.user.findUnique({ where: { openid } })
  if (user && user.status === USER_STATUS.CANCELLED) {
    user = null
  }
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: newId('usr'),
        openid,
        unionid: unionid || null,
        nickname: '',
      },
    })
  } else if (unionid && !user.unionid) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { unionid },
    })
  }

  return buildAuthSession(user)
}

async function devBindPhone(userId) {
  const phone = '13812345678'
  await prisma.user.update({
    where: { id: userId },
    data: { phone },
  })
  return {
    phone,
    phoneDisplay: maskPhone(phone),
    isPhoneBound: true,
  }
}

async function bindPhone(userId, payload = {}) {
  const phoneCode = payload.code || payload.phoneCode || ''

  if (phoneCode && config.wechat.configured) {
    const phone = await getPhoneNumber(phoneCode)
    await prisma.user.update({
      where: { id: userId },
      data: { phone },
    })
    await linkPendingStaffForUser(userId, phone)
    return {
      phone,
      phoneDisplay: maskPhone(phone),
      isPhoneBound: true,
    }
  }

  if (config.devAuthEnabled && !phoneCode) {
    const dev = await devBindPhone(userId)
    await linkPendingStaffForUser(userId, dev.phone)
    return dev
  }

  const err = new Error('请授权微信手机号')
  err.status = 400
  throw err
}

async function updateUserProfile(userId, payload = {}) {
  if (!userId) {
    const err = new Error('未授权')
    err.status = 401
    throw err
  }

  const data = {}
  if (payload.nickname !== undefined) {
    data.nickname = String(payload.nickname || '').trim().slice(0, 32)
  }
  if (payload.avatarUrl !== undefined) {
    data.avatarUrl = normalizeStoredAvatarUrl(payload.avatarUrl)
  }

  if (!Object.keys(data).length) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      const err = new Error('用户不存在')
      err.status = 404
      throw err
    }
    return formatUserPayload(user)
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
  })
  return formatUserPayload(user)
}

async function fetchMineSummary(userId) {
  if (!userId) {
    const err = new Error('未授权')
    err.status = 401
    throw err
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    const err = new Error('用户不存在')
    err.status = 404
    throw err
  }

  const phone = user.phone || ''
  const merchantCtx = await resolveMerchantContext(userId)
  const [consultPending, albumPendingAuth, unreadNotificationCount, recentAlbums, albumBindingCount] =
    await Promise.all([
    prisma.consultLead.count({
      where: {
        userId,
        status: { in: ['SUBMITTED', 'VIEWED', 'CONTACTED'] },
      },
    }),
    prisma.album.count({
      where: {
        OR: [{ userId }, ...(phone ? [{ userPhone: phone }] : [])],
        status: 'completed',
        publicCaseStatus: 'private',
        imageCount: { gt: 0 },
      },
    }),
    (async () => {
      try {
        const { getUnreadCount, RECEIVER } = require('./notification.service')
        return getUnreadCount(RECEIVER.USER, userId)
      } catch (e) {
        return 0
      }
    })(),
    listUserRecentServiceAlbums(userId, MINE_RECENT_ALBUMS_LIMIT),
    countUserServiceAlbumBindings(userId),
  ])

  return {
    user: formatUserPayload(user),
    roles: merchantCtx ? [ROLES.USER, ROLES.MERCHANT] : [ROLES.USER],
    merchant: formatMerchantPayload(merchantCtx),
    consultPending,
    albumPendingAuth,
    unreadNotificationCount,
    authorizeCount: 0,
    recentAlbums,
    hasAlbumBindings: albumBindingCount > 0,
  }
}

module.exports = {
  devWechatLogin,
  wechatLogin,
  devBindPhone,
  bindPhone,
  fetchMineSummary,
  updateUserProfile,
  buildAuthSession,
}
