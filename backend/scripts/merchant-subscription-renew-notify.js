/**
 * 商家套餐到期续费提醒（每日 cron）
 *
 * 用法：
 *   node scripts/merchant-subscription-renew-notify.js
 *   node scripts/merchant-subscription-renew-notify.js --days=7
 *
 * 建议 crontab（每天 10:00）：
 *   0 10 * * * cd /path/to/backend && node scripts/merchant-subscription-renew-notify.js >> logs/sub-renew.log 2>&1
 */
const { prisma } = require('../src/lib/prisma')
const { notifySubscriptionRenewal } = require('../src/services/notification.service')
const {
  MERCHANT_PLAN_LABELS,
  MERCHANT_PLAN_TAG_LABELS,
  MERCHANT_SUBSCRIPTION_STATUS,
  PUBLIC_INDEX_PLANS,
} = require('../src/constants/merchant-subscription')

const DEFAULT_THRESHOLDS = [30, 7, 3, 1, 0]

function parseArgs(argv) {
  const out = { thresholds: DEFAULT_THRESHOLDS }
  for (const arg of argv) {
    const m = arg.match(/^--days=(\d+)$/)
    if (m) out.thresholds = [Number(m[1])]
  }
  return out
}

function dayRangeFromToday(daysLeft) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() + daysLeft)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

async function findSubscriptionsExpiringIn(daysLeft) {
  const { start, end } = dayRangeFromToday(daysLeft)
  return prisma.merchantSubscription.findMany({
    where: {
      plan: { in: [...PUBLIC_INDEX_PLANS] },
      status: MERCHANT_SUBSCRIPTION_STATUS.ACTIVE,
      expiresAt: { gte: start, lte: end },
    },
    select: {
      merchantId: true,
      plan: true,
      expiresAt: true,
    },
  })
}

async function main() {
  const { thresholds } = parseArgs(process.argv.slice(2))
  let sent = 0
  let skipped = 0

  for (const daysLeft of thresholds) {
    const rows = await findSubscriptionsExpiringIn(daysLeft)
    for (const row of rows) {
      const result = await notifySubscriptionRenewal({
        merchantId: row.merchantId,
        plan: row.plan,
        tierLabel:
          MERCHANT_PLAN_TAG_LABELS[row.plan] || '标准版',
        planLabel:
          MERCHANT_PLAN_LABELS[row.plan] || '收录套餐',
        expiresAt: row.expiresAt,
        daysLeft,
      })
      if (result) sent += 1
      else skipped += 1
    }
  }

  console.log('[subscription-renew-notify]', {
    thresholds,
    sent,
    skipped,
    at: new Date().toISOString(),
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
