/**
 * CASE-ENR-06 · enrichment 变更 → Feed/API 更新且 snapshot 不变（可单独跑）
 *
 * 用法：
 *   # 须先有带 snapshot 的 public_approved 案例（卷九后授权案例，或保留冒烟数据）：
 *   SMOKE_KEEP_DATA=1 DESENSITIZE_ENGINE=dev npm run case:snapshot-smoke
 *   SMOKE_CASE_ID=case_xxx npm run case:enrichment-feed-smoke
 *
 *   npm run case:enrichment-feed-smoke
 *   SMOKE_CASE_ID=case_xxx npm run case:enrichment-feed-smoke
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { verifyCaseEnrichmentFeedSegment } = require('./h5-chain-smoke-segment-enr')

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const CASE_ID_ENV = process.env.SMOKE_CASE_ID || ''

const prisma = new PrismaClient()

async function pickCaseId() {
  if (CASE_ID_ENV) return CASE_ID_ENV
  const row = await prisma.publicCase.findFirst({
    where: {
      status: 'public_approved',
      articleStatus: { in: ['published_h5', 'published_wechat'] },
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, contentJson: true },
  })
  if (!row?.id) throw new Error('无 public_approved 案例')
  const { extractSnapshotFromContentJson } = require('../src/schemas/case-snapshot.schema')
  if (!extractSnapshotFromContentJson(row.contentJson)) {
    throw new Error(
      '无带 snapshot 的案例。卷九前存量案例无 snapshot；请：\n' +
        '  SMOKE_KEEP_DATA=1 DESENSITIZE_ENGINE=dev SMOKE_BASE_URL=http://127.0.0.1:3100 npm run case:snapshot-smoke\n' +
        '  SMOKE_CASE_ID=<上一步 caseId> npm run case:enrichment-feed-smoke'
    )
  }
  return row.id
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('需要 DATABASE_URL')
  }
  const caseId = await pickCaseId()
  const result = await verifyCaseEnrichmentFeedSegment({
    prisma,
    caseId,
    baseUrl: BASE,
  })
  if (result?.skipped) {
    throw new Error(`ENR-06 跳过: ${result.reason}`)
  }
  console.log('[case-enrichment-feed-smoke] ✅ 通过', caseId)
}

main()
  .catch((e) => {
    console.error('[case-enrichment-feed-smoke] ❌', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
