/**
 * 一次性：把旧底稿/旧信封收进节点内容，残缺交车报告按冻住节点重生成。
 * 只跑预发。生产禁止用本脚本，除非产品点头。
 *
 * 运行：cd backend && node scripts/migrate-flow-content-once.cjs
 * 预演：DRY_RUN=1 node scripts/migrate-flow-content-once.cjs
 */
'use strict'

const { prisma } = require('../src/lib/prisma')
const { migrateFlowPackageOnce } = require('../src/services/service-flow.service')

const dryRun = String(process.env.DRY_RUN || '') === '1'

async function main() {
  const albums = await prisma.album.findMany({
    select: { id: true, contentPackageJson: true },
  })
  let scanned = 0
  let changed = 0
  for (const album of albums) {
    const pkg =
      album.contentPackageJson && typeof album.contentPackageJson === 'object'
        ? album.contentPackageJson
        : null
    if (!pkg || !Array.isArray(pkg.flowNodes) || !pkg.flowNodes.length) continue
    scanned += 1
    const { pkg: next, changed: dirty } = migrateFlowPackageOnce(pkg, album)
    if (!dirty) continue
    changed += 1
    if (dryRun) continue
    await prisma.album.update({
      where: { id: album.id },
      data: { contentPackageJson: next },
    })
  }
  console.log(
    `[migrate-flow-content-once] scanned=${scanned} changed=${changed} dryRun=${dryRun}`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
