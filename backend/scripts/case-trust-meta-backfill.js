/**
 * GEO-TRUST-04 · 存量已发布案例 trustMeta 回填
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { refreshCaseTrustMeta } = require('../src/services/case-trust-meta.service')
const { extractSnapshotFromContentJson } = require('../src/schemas/case-snapshot.schema')

const prisma = new PrismaClient()

async function main() {
  const limit = Number(process.env.BACKFILL_LIMIT || 500)
  const rows = await prisma.publicCase.findMany({
    where: { status: 'public_approved' },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    if (!extractSnapshotFromContentJson(row.contentJson)) {
      skipped += 1
      continue
    }
    try {
      const result = await refreshCaseTrustMeta(row.id, { row })
      if (result.skipped) skipped += 1
      else updated += 1
    } catch (e) {
      failed += 1
      console.warn('[case-trust-meta-backfill] fail', row.id, e.message)
    }
  }

  console.log('[case-trust-meta-backfill] done', {
    total: rows.length,
    updated,
    skipped,
    failed,
  })
}

main()
  .catch((e) => {
    console.error('[case-trust-meta-backfill] ❌', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
