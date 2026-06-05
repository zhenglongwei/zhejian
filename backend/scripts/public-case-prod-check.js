/**
 * H5-A-01 生产只读验收：公开案例是否已入库且用户读 API 可返回 storeId + 脱敏 URL
 *
 * 用法：
 *   node scripts/public-case-prod-check.js
 *   SMOKE_BASE_URL=https://geo.simplewin.cn node scripts/public-case-prod-check.js
 *   SMOKE_CASE_ID=case_xxx node scripts/public-case-prod-check.js
 *
 * 服务器上有 DATABASE_URL 时额外查 public_cases 表（可选）。
 */
require('dotenv').config()

const BASE = process.env.SMOKE_BASE_URL || 'https://geo.simplewin.cn'
const CASE_ID = process.env.SMOKE_CASE_ID || ''
const FALLBACK_IDS = new Set(['case_svc_demo_completed'])

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function isDesensitizedUrl(url) {
  if (!url || typeof url !== 'string') return false
  const v = url.trim()
  if (v.startsWith('mock://desensitized/')) return true
  if (v.includes('/files/uploads/desensitized/')) return true
  if (v.includes('/media/files/uploads/desensitized/')) return true
  return false
}

function isRawUploadUrl(url) {
  if (!url || typeof url !== 'string') return false
  const v = url.trim()
  if (v.includes('/media/raw/')) return true
  if (/\/files\/uploads\/\d{4}\/\d{2}\//.test(v) && !v.includes('/desensitized/')) return true
  if (v.includes('wxfile://')) return true
  return false
}

function collectUrls(value, out = []) {
  if (value == null) return out
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value) || value.includes('/files/') || value.includes('mock://')) {
      out.push(value)
    }
    return out
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, out))
    return out
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectUrls(item, out))
  }
  return out
}

function assertPublicCasePayload(caseItem) {
  assert(caseItem && caseItem.id, '缺少案例 id')
  assert(caseItem.storeId, `案例 ${caseItem.id} 缺少 storeId`)
  assert(
    caseItem.status === undefined || caseItem.status === 'public_approved' || !caseItem.status,
    `案例 ${caseItem.id} 状态异常: ${caseItem.status}`
  )

  const urls = collectUrls(caseItem)
  const rawHits = urls.filter(isRawUploadUrl)
  assert(rawHits.length === 0, `用户 API 含疑似原图 URL: ${rawHits.slice(0, 3).join(', ')}`)

  const imageUrls = urls.filter(
    (u) => u.includes('/files/') || u.includes('mock://') || u.includes('/media/')
  )
  if (imageUrls.length) {
    const desensitized = imageUrls.filter(isDesensitizedUrl)
    assert(
      desensitized.length > 0 || !caseItem.coverImage,
      `案例 ${caseItem.id} 有图但无脱敏 URL（cover/nodes 可能未就绪）`
    )
  }

  assert(!JSON.stringify(caseItem).includes('rawUrl'), '用户 API 响应不得含 rawUrl 字段')
}

async function apiGet(path) {
  const res = await fetch(`${BASE}/api/v1${path}`)
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

async function queryDbApprovedCases() {
  if (!process.env.DATABASE_URL) return null
  try {
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    const rows = await prisma.publicCase.findMany({
      where: { status: 'public_approved' },
      select: {
        id: true,
        storeId: true,
        storeName: true,
        status: true,
        publishedAt: true,
        albumId: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    })
    await prisma.$disconnect()
    return rows
  } catch (e) {
    console.warn('[check] DATABASE_URL 查询跳过:', e.message)
    return null
  }
}

async function main() {
  console.log('[check] H5-A-01 公开案例生产验收')
  console.log('[check] BASE =', BASE)

  const health = await apiGet('/health')
  assert(health.ok && health.json?.data?.ok !== false, `health 失败: ${health.status}`)
  console.log('[check] health OK')

  const dbRows = await queryDbApprovedCases()
  if (dbRows) {
    console.log('[check] DB public_approved 数量 =', dbRows.length)
    dbRows.slice(0, 5).forEach((row) => {
      console.log('  -', row.id, row.storeId, row.storeName, row.publishedAt?.toISOString?.() || '')
    })
    if (!dbRows.length) {
      console.warn('[check] ⚠ DB 无 public_approved 记录 — 需走商家提交 + 运营审核（H5-A-01 运营步骤）')
    }
  } else {
    console.log('[check] 无 DATABASE_URL，跳过 DB 直查（可在 ECS 执行 SQL）')
  }

  const listRes = await apiGet('/user/cases?page=1&pageSize=20')
  assert(listRes.ok && listRes.json?.code === 0, `案例列表失败: ${listRes.status}`)
  const list = listRes.json.data?.list || listRes.json.data || []
  assert(Array.isArray(list) && list.length > 0, '案例列表为空（需 ACTIVE 门店 + 已审核 public_approved）')
  console.log('[check] 用户案例列表数量 =', list.length)

  const dbBacked = list.filter((item) => !FALLBACK_IDS.has(item.id))
  const onlyFallback = dbBacked.length === 0
  if (onlyFallback) {
    console.warn(
      '[check] ⚠ 列表可能仅 fallback 种子（' +
        list.map((i) => i.id).join(', ') +
        '）— 生产须至少 1 条真实入库案例'
    )
  } else {
    console.log('[check] 非 fallback 案例 ID =', dbBacked.map((i) => i.id).join(', '))
  }

  const targets = CASE_ID
    ? list.filter((i) => i.id === CASE_ID)
    : dbBacked.length
      ? dbBacked.slice(0, 3)
      : list.slice(0, 1)

  assert(targets.length, `未找到待验案例${CASE_ID ? `: ${CASE_ID}` : ''}`)

  for (const item of targets) {
    const detailRes = await apiGet(`/user/cases/${encodeURIComponent(item.id)}`)
    assert(detailRes.ok && detailRes.json?.code === 0, `案例详情 ${item.id} 失败`)
    const detail = detailRes.json.data
    assertPublicCasePayload(detail)
    console.log(
      '[check] ✅',
      detail.id,
      'storeId=',
      detail.storeId,
      'cover=',
      detail.coverImage ? '有脱敏封面' : '无封面',
      'nodes=',
      (detail.nodes || []).length
    )
  }

  if (onlyFallback && !(dbRows && dbRows.length)) {
    console.error('')
    console.error('[check] ❌ H5-A-01 未通过：生产尚无真实 public_cases 入库')
    console.error('  运营步骤：')
    console.error('  1. 商家小程序：服务相册完工（无车主）→ 脱敏确认 → 提交审核')
    console.error('  2. admin-web /admin/cases → 审核通过')
    console.error('  3. ECS SQL: SELECT id,store_id,status FROM public_cases WHERE status=\'public_approved\';')
    console.error('  4. 重跑: SMOKE_BASE_URL=... node scripts/public-case-prod-check.js')
    process.exit(1)
  }

  console.log('[check] ✅ H5-A-01 API 验收通过（storeId + 脱敏 URL + 无 rawUrl）')
}

main().catch((e) => {
  console.error('[check] ❌', e.message)
  process.exit(1)
})
