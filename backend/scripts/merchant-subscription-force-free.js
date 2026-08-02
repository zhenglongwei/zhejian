/**
 * 将全部商家订阅统一为免费可用（当前商业口径：全功能免费）
 *
 * 用法：
 *   node scripts/merchant-subscription-force-free.js
 *   DRY_RUN=1 node scripts/merchant-subscription-force-free.js
 *
 * 环境：需 DATABASE_URL（.env）
 */
require('dotenv').config()

const { PrismaClient } = require('@prisma/client')
const {
  MERCHANT_PLAN,
  MERCHANT_SUBSCRIPTION_STATUS,
} = require('../src/constants/merchant-subscription')
const { syncMerchantCasesPublicIndex } = require('../src/services/merchant-subscription.service')

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const prisma = new PrismaClient()

function log(msg) {
  console.log(`[subscription-force-free] ${msg}`)
}

async function main() {
  const rows = await prisma.merchantSubscription.findMany({
    select: {
      merchantId: true,
      plan: true,
      status: true,
      expiresAt: true,
      pendingPlan: true,
    },
  })
  log(`共 ${rows.length} 条订阅记录`)

  const needUpdate = rows.filter(
    (r) =>
      r.plan !== MERCHANT_PLAN.FREE ||
      r.status !== MERCHANT_SUBSCRIPTION_STATUS.ACTIVE ||
      r.expiresAt != null ||
      r.pendingPlan != null
  )
  log(`需更新 ${needUpdate.length} 条`)

  if (DRY_RUN) {
    needUpdate.slice(0, 20).forEach((r) => {
      log(
        `DRY ${r.merchantId} plan=${r.plan} status=${r.status} expires=${r.expiresAt || '-'} pending=${r.pendingPlan || '-'}`
      )
    })
    if (needUpdate.length > 20) log(`…其余 ${needUpdate.length - 20} 条省略`)
    return
  }

  if (needUpdate.length) {
    await prisma.merchantSubscription.updateMany({
      data: {
        plan: MERCHANT_PLAN.FREE,
        status: MERCHANT_SUBSCRIPTION_STATUS.ACTIVE,
        expiresAt: null,
        pendingPlan: null,
      },
    })
    log('已 updateMany → free / active / 清空到期与预约')
  }

  let synced = 0
  for (const r of rows) {
    try {
      await syncMerchantCasesPublicIndex(r.merchantId)
      synced += 1
    } catch (e) {
      log(`sync 失败 ${r.merchantId}: ${(e && e.message) || e}`)
    }
  }
  log(`公域收录同步完成 ${synced}/${rows.length}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
