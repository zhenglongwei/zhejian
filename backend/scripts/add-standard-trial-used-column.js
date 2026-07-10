/**
 * 一次性脚本：merchant_subscriptions.standard_trial_used
 * 用法：cd backend && node scripts/add-standard-trial-used-column.js
 */
const { prisma } = require('../src/lib/prisma')

async function main() {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE merchant_subscriptions ADD COLUMN standard_trial_used BOOLEAN NOT NULL DEFAULT false'
    )
    console.log('[add-standard-trial-used] column added')
  } catch (error) {
    const msg = String(error.message || '')
    if (msg.includes('Duplicate column') || msg.includes('already exists')) {
      console.log('[add-standard-trial-used] column already exists, skip')
    } else {
      throw error
    }
  }

  const updated = await prisma.$executeRawUnsafe(
    "UPDATE merchant_subscriptions SET standard_trial_used = true WHERE plan IN ('index_99', 'optimize_299')"
  )
  console.log('[add-standard-trial-used] legacy plans marked used:', updated)

  const merchantsWithOrders = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT merchant_id AS merchantId
    FROM merchant_payment_orders
    WHERE plan = 'index_99' AND status = 'paid'
  `)
  for (const row of merchantsWithOrders || []) {
    const merchantId = row.merchantId || row.merchant_id
    if (!merchantId) continue
    await prisma.merchantSubscription.updateMany({
      where: { merchantId },
      data: { standardTrialUsed: true },
    })
  }
  console.log(
    '[add-standard-trial-used] merchants with prior index_99 orders marked:',
    (merchantsWithOrders || []).length
  )
}

main()
  .catch((error) => {
    console.error('[add-standard-trial-used] failed:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
