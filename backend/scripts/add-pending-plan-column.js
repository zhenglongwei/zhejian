const { prisma } = require('../src/lib/prisma')

async function main() {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE merchant_subscriptions ADD COLUMN pending_plan VARCHAR(191) NULL'
    )
    console.log('pending_plan column added')
  } catch (e) {
    if (/Duplicate column/i.test(e.message)) {
      console.log('pending_plan column already exists')
      return
    }
    throw e
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
