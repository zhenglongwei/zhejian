/**
 * PV-P4-OPS · 存量 anonymous 公开案例批量下线
 *
 * 将 authorization_tier = anonymous 的 public_cases 设为 offline，
 * 同步 album.public_case_status，并写入 CaseReviewLog 留痕。
 *
 * 用法：
 *   node scripts/offline-anonymous-public-cases.js          # 执行
 *   DRY_RUN=1 node scripts/offline-anonymous-public-cases.js  # 仅预览
 *
 * 环境：需 DATABASE_URL（.env）
 */
require('dotenv').config()

const { PrismaClient } = require('@prisma/client')
const { PUBLIC_CASE_STATUS } = require('../src/constants/v2')
const { newId } = require('../src/lib/ids')

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const prisma = new PrismaClient()

const ACTIVE_STATUSES = new Set([
  PUBLIC_CASE_STATUS.PENDING_REVIEW,
  PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
])

function log(msg) {
  console.log(`[offline-anonymous] ${msg}`)
}

async function main() {
  const rows = await prisma.publicCase.findMany({
    where: {
      authorizationTier: 'anonymous',
      status: { not: PUBLIC_CASE_STATUS.OFFLINE },
    },
    select: {
      id: true,
      albumId: true,
      status: true,
      storeName: true,
      title: true,
    },
  })

  if (!rows.length) {
    log('无待下线的 anonymous 案例')
    return
  }

  log(`发现 ${rows.length} 条 anonymous 案例${DRY_RUN ? '（DRY_RUN）' : ''}`)
  rows.forEach((row) => {
    log(`  · ${row.id} album=${row.albumId} status=${row.status} store=${row.storeName || '—'}`)
  })

  if (DRY_RUN) {
    log('DRY_RUN=1，未写入数据库')
    return
  }

  const now = new Date()
  let updated = 0

  for (const row of rows) {
    await prisma.$transaction(async (tx) => {
      await tx.publicCase.update({
        where: { id: row.id },
        data: {
          status: PUBLIC_CASE_STATUS.OFFLINE,
          seoNoindex: true,
          updatedAt: now,
        },
      })
      await tx.album.update({
        where: { id: row.albumId },
        data: { publicCaseStatus: PUBLIC_CASE_STATUS.OFFLINE },
      })
      await tx.caseReviewLog.create({
        data: {
          id: newId('crl'),
          caseId: row.id,
          reviewerId: 'system:pv_reform',
          reviewAction: 'ops_offline_anonymous',
          reviewComment: 'PV-REFORM：废止匿名公示档，存量 anonymous 案例运营批量下线',
          beforeStatus: row.status,
          afterStatus: PUBLIC_CASE_STATUS.OFFLINE,
        },
      })
    })
    updated += 1
  }

  log(`已下线 ${updated} 条；如需重新公示，须车主以授权公示（含门店名）重新授权`)
}

main()
  .catch((err) => {
    console.error('[offline-anonymous] failed:', err.message || err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
