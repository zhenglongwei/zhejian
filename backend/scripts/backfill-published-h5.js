/**
 * DS-B-04 · 存量 public_approved 案例补发 published_h5（无需 HTTP API）
 *
 * 用法（ECS / 本机，读 backend/.env DATABASE_URL）：
 *   node scripts/backfill-published-h5.js
 *   node scripts/backfill-published-h5.js --store-id=store_demo_1 --limit=100
 */
require('dotenv').config()
const { backfillPublishedH5ForApprovedCases } = require('../src/services/case-article-publish.service')

function parseArg(name) {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length).trim() : ''
}

async function main() {
  const storeId = parseArg('store-id') || parseArg('storeId') || process.env.BACKFILL_STORE_ID || ''
  const limit = parseArg('limit') || process.env.BACKFILL_LIMIT || ''
  const result = await backfillPublishedH5ForApprovedCases({
    storeId,
    limit: limit ? Number(limit) : undefined,
  })
  console.log('[backfill-published-h5] done', JSON.stringify(result))
}

main()
  .catch((e) => {
    console.error('[backfill-published-h5] failed', e.message)
    process.exit(1)
  })
  .finally(() => {
    const { prisma } = require('../src/lib/prisma')
    return prisma.$disconnect()
  })
