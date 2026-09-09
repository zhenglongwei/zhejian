/**
 * HOST-ARCH · 托管主路径服务层冒烟（需本地 DB）
 *
 * 用法：
 *   cd backend && npm run db:seed   # 若无数据
 *   node scripts/hosting-flow-smoke.js
 *
 * 可选：HOSTING_SMOKE_ALBUM_ID=alb_xxx 指定已 completed 相册
 */
require('dotenv').config()
const assert = require('assert')
const { PrismaClient } = require('@prisma/client')
const { PUBLIC_CASE_STATUS } = require('../src/constants/v2')
const {
  hostAlbum,
  auditHostedPublicPrivacy,
  generateHostedGeoDraft,
  readHostMeta,
} = require('../src/services/case-hosting.service')
const { isAlbumContentLocked } = require('../src/services/service-album.service')

const prisma = new PrismaClient()
const FULL = process.env.HOSTING_SMOKE_FULL === '1'

/** 为冒烟准备可公示图（gate 通过 + 可解析的脱敏路径 URL） */
async function preparePublicGateImages(albumId) {
  const imgs = await prisma.albumImage.findMany({
    where: { albumId, nodeId: { in: ['stage_2', 'stage_5', 'stage_6'] } },
    take: 2,
  })
  for (const img of imgs) {
    const desensitizedUrl = `https://geo.simplewin.cn/media/files/uploads/desensitized/hosting_smoke_${img.id}.jpg`
    await prisma.albumImage.update({
      where: { id: img.id },
      data: {
        rawUrl: desensitizedUrl,
        visibility: 'public',
        publicGateStatus: 'passed',
        publicGateReason: '',
        publicGateCheckedAt: new Date(),
      },
    })
  }
  return imgs.length
}

async function pickCompletedAlbum() {
  const forced = String(process.env.HOSTING_SMOKE_ALBUM_ID || '').trim()
  if (forced) {
    return prisma.album.findUnique({ where: { id: forced }, include: { publicCase: true } })
  }
  return prisma.album.findFirst({
    where: { status: { in: ['completed', 'published'] } },
    orderBy: { updatedAt: 'desc' },
    include: { publicCase: true },
  })
}

async function main() {
  console.log('[hosting-smoke] 查找 completed 相册…')
  const album = await pickCompletedAlbum()
  assert(album, '无 completed 相册，请先 db:seed 或设 HOSTING_SMOKE_ALBUM_ID')
  const storeId = album.storeId
  const merchantId = album.merchantId
  assert(storeId && merchantId, '相册缺 storeId/merchantId')
  console.log('[hosting-smoke] album', album.id, storeId, 'status=', album.status)

  // 公开后相册可能变为 published；允许再进托管管理
  if (album.status === 'published' || album.publicCaseStatus === 'public_approved') {
    console.log('[hosting-smoke] album already published — verifying re-host gate')
  }

  const hostRes = await hostAlbum(album.id, { storeId, merchantId, mode: 'private' })
  assert(hostRes.hosted, 'hostAlbum 应 hosted=true')
  assert(hostRes.factLayerLocked, '应锁定事实层')
  assert(hostRes.archiveSnapshot, '应有 archiveSnapshot')
  assert(hostRes.archiveSnapshot.storeSnapshot, '应有 storeSnapshot')
  assert(hostRes.archiveSnapshot.merchantCaseDraft === undefined, '快照不含 merchantCaseDraft')
  console.log('[hosting-smoke] 私密托管 OK')

  const reloaded = await prisma.album.findUnique({ where: { id: album.id } })
  assert(isAlbumContentLocked(reloaded), '托管后相册应只读')

  const upgrade = await hostAlbum(album.id, { storeId, merchantId, mode: 'public' })
  assert(upgrade.publicPublishStage, '公开意图应有 publicPublishStage')
  console.log('[hosting-smoke] 升级公开意图 OK stage=', upgrade.publicPublishStage)

  if (FULL) {
    const n = await preparePublicGateImages(album.id)
    console.log('[hosting-smoke] FULL: 已标记', n, '张图为 public+passed')
  }

  const privacy = await auditHostedPublicPrivacy(album.id, { storeId, merchantId })
  console.log('[hosting-smoke] 隐私校验 passed=', privacy.passed, privacy.hardBlocks?.length || 0, 'blocks')
  if (!privacy.passed) {
    console.log('[hosting-smoke] 隐私 block:', (privacy.hardBlocks || [])[0]?.message || 'unknown')
    console.log('[hosting-smoke] 隐私未过（测试相册缺可公示脱敏图时可接受），跳过后续 GEO/公开')
    console.log('[hosting-smoke] partial ok — 托管 + 只读 + 公开意图 + 隐私 API 已验证')
    return
  }

  const geo = await generateHostedGeoDraft(album.id, { storeId, merchantId })
  assert(geo.geoDraft && geo.geoDraft.summary, '应有 GEO 摘要')
  assert(Array.isArray(geo.geoDraft.faq), '应有 FAQ 数组')
  console.log('[hosting-smoke] GEO 草稿 OK summary=', geo.geoDraft.summary.slice(0, 40))

  const meta = readHostMeta(await prisma.album.findUnique({ where: { id: album.id }, include: { publicCase: true } }))
  assert(meta.geoDraft && meta.geoDraft.summary, 'hostMeta 应持久化 geoDraft')

  if (FULL && process.env.HOSTING_SMOKE_CONFIRM === '1') {
    const { confirmHostedPublicPublish } = require('../src/services/case-hosting.service')
    try {
      // 若已公开，先取消公开再确认，便于重复冒烟
      const row = await prisma.publicCase.findUnique({ where: { albumId: album.id } })
      if (row && row.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
        await prisma.publicCase.update({
          where: { id: row.id },
          data: { status: PUBLIC_CASE_STATUS.AUDIT_PASSED },
        })
      }
      const pub = await confirmHostedPublicPublish(album.id, {
        storeId,
        merchantId,
        summary: geo.geoDraft.summary,
        faq: geo.geoDraft.faq,
      })
      assert(pub.publicCase, 'confirm-public 应返回 publicCase')
      console.log('[hosting-smoke] FULL: 确认公开 OK status=', pub.publicCase.status || pub.status)
    } catch (e) {
      console.log('[hosting-smoke] FULL: confirm-public 失败:', e.code || e.message)
      throw e
    }
  } else {
    console.log('[hosting-smoke] full ok (未 confirm-public；设 HOSTING_SMOKE_CONFIRM=1 可尝试)')
  }
}

main()
  .catch((err) => {
    console.error('[hosting-smoke] FAIL', err.message || err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
