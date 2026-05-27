const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { maskPhone } = require('../lib/ids')

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

  const phone = dbUser.phone || ''
  return {
    token: config.devTokens.user,
    user: {
      userId: dbUser.id,
      nickname: dbUser.nickname || '演示用户',
      avatarUrl: '',
      phoneDisplay: phone ? maskPhone(phone) : '',
      isPhoneBound: Boolean(phone),
    },
  }
}

async function devBindPhone(userId) {
  const phone = '13812345678'
  await prisma.user.update({
    where: { id: userId },
    data: { phone },
  })
  return {
    phoneDisplay: maskPhone(phone),
    isPhoneBound: true,
  }
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
  const [consultPending, albumPendingAuth] = await Promise.all([
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
      },
    }),
  ])

  return {
    user: {
      userId: user.id,
      nickname: user.nickname || '',
      avatarUrl: '',
      phoneDisplay: phone ? maskPhone(phone) : '',
      isPhoneBound: Boolean(phone),
    },
    consultPending,
    albumPendingAuth,
    authorizeCount: 0,
  }
}

module.exports = {
  devWechatLogin,
  devBindPhone,
  fetchMineSummary,
}
