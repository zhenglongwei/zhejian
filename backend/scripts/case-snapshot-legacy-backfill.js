/**
 * 卷九前存量案例 · 将 contentJson.nodes 冻结为 snapshot v1
 *
 * 用法：
 *   node scripts/case-snapshot-legacy-backfill.js
 *   node scripts/case-snapshot-legacy-backfill.js --dry-run
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const {
  extractSnapshotFromContentJson,
  normalizeCaseSnapshot,
} = require('../src/schemas/case-snapshot.schema')

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry-run')

function buildLegacySnapshot(row) {
  const contentJson =
    row.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
  if (extractSnapshotFromContentJson(contentJson)) return null

  const nodes = Array.isArray(contentJson.nodes) ? contentJson.nodes : []
  const frozenAt = row.publishedAt
    ? new Date(row.publishedAt).toISOString()
    : new Date().toISOString()

  const snapshot = normalizeCaseSnapshot({
    version: 1,
    frozenAt,
    authorizationTier: row.authorizationTier || 'named',
    title: row.title || '',
    summary: row.summary || '',
    nodes,
    storeId: row.storeId || '',
    serviceName: row.serviceName || '',
    city: row.city || '',
    albumStatus: 'completed',
  })
  return snapshot
}

async function main() {
  const rows = await prisma.publicCase.findMany({
    where: { status: 'public_approved' },
    orderBy: { updatedAt: 'desc' },
  })

  let updated = 0
  let skipped = 0

  for (const row of rows) {
    const snapshot = buildLegacySnapshot(row)
    if (!snapshot) {
      skipped += 1
      continue
    }

    const contentJson =
      row.contentJson && typeof row.contentJson === 'object' ? { ...row.contentJson } : {}
    contentJson.snapshot = snapshot

    if (DRY_RUN) {
      console.log('[case-snapshot-legacy-backfill] dry-run', row.id, {
        nodeCount: snapshot.nodes.length,
      })
      updated += 1
      continue
    }

    await prisma.publicCase.update({
      where: { id: row.id },
      data: { contentJson },
    })
    updated += 1
    console.log('[case-snapshot-legacy-backfill] updated', row.id)
  }

  console.log('[case-snapshot-legacy-backfill] done', {
    total: rows.length,
    updated,
    skipped,
    dryRun: DRY_RUN,
  })
}

main()
  .catch((e) => {
    console.error('[case-snapshot-legacy-backfill] ❌', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
