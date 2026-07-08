/**
 * CASE-SNAP-01/02 冒烟：授权公示写入 snapshot + 授权后 merchant save 409
 *
 * 用法（本地）：
 *   npm run db:seed
 *   node scripts/case-snapshot-smoke.js
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { publishServicePublicCase } = require('../src/services/public-case.service')
const {
  saveMerchantServiceAlbum,
  submitServiceAlbumAuthorization,
  isAlbumContentLocked,
  ALBUM_CONTENT_LOCKED_MESSAGE,
} = require('../src/services/service-album.service')
const { extractSnapshotFromContentJson } = require('../src/schemas/case-snapshot.schema')

const prisma = new PrismaClient()

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function main() {
  const album = await prisma.album.findFirst({
    where: {
      status: { in: ['completed', 'published'] },
      userId: { not: '' },
    },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      authorization: true,
      publicCase: true,
    },
  })
  assert(album, 'seed 中需有已完工且关联用户的相册')

  const userId = album.userId
  assert(userId, '相册需关联 userId')

  await submitServiceAlbumAuthorization(album.id, userId, { agreed: true, tier: 'named' })

  const lockedAlbum = await prisma.album.findUnique({
    where: { id: album.id },
    include: { authorization: true },
  })
  assert(isAlbumContentLocked(lockedAlbum), '授权后相册应锁定')

  let saveBlocked = false
  try {
    await saveMerchantServiceAlbum(album.id, album.storeId, { storeNote: '尝试修改' }, album.merchantId)
  } catch (err) {
    saveBlocked = err.status === 409 && err.message === ALBUM_CONTENT_LOCKED_MESSAGE
  }
  assert(saveBlocked, '授权后 merchant save 应返回 409')

  const publishResult = await publishServicePublicCase(album.id, userId, {})
  assert(publishResult.caseItem.snapshotVersion === 1, '首次公示 snapshotVersion 应为 1')

  const row = await prisma.publicCase.findUnique({ where: { albumId: album.id } })
  assert(row, 'publicCase 应已创建')
  const snapshot = extractSnapshotFromContentJson(row.contentJson)
  assert(snapshot, 'contentJson.snapshot 应存在')
  assert(snapshot.version === 1, 'snapshot.version 应为 1')
  assert(snapshot.frozenAt, 'snapshot.frozenAt 应存在')
  assert(Array.isArray(snapshot.nodes), 'snapshot.nodes 应为数组')
  assert(row.articleBody === snapshot.articleBody, '顶列 articleBody 应与 snapshot 同步')

  console.log('[case-snapshot-smoke] OK', {
    albumId: album.id,
    caseId: row.id,
    snapshotVersion: snapshot.version,
    nodeCount: snapshot.nodes.length,
  })
}

main()
  .catch((err) => {
    console.error('[case-snapshot-smoke] FAIL', err.message || err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
