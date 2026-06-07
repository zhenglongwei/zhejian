const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

/**
 * 发版新增 Prisma model 后若未 db:setup:prod，delegate 为 undefined。
 * @param {string} delegateKey 如 userFavorite
 * @param {string} label 日志/错误展示名
 */
function assertPrismaDelegate(delegateKey, label = delegateKey) {
  if (prisma[delegateKey]) return
  const err = new Error(
    `${label} 未就绪：请在 backend 目录执行 npm run db:setup:prod 后 pm2 restart zhejian-api`
  )
  err.status = 503
  err.code = 100503
  throw err
}

module.exports = { prisma, assertPrismaDelegate }
