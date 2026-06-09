/**
 * H5-A-01 端到端冒烟：冷启动相册 → 脱敏确认 → 提交公开案例 → 运营审核通过 → 用户读 API
 *
 * 用法（本地，建议 DESENSITIZE_ENGINE=dev）：
 *   npm run db:seed
 *   DESENSITIZE_ENGINE=dev node scripts/public-case-smoke.js
 *
 * 远程：
 *   SMOKE_BASE_URL=https://geo.simplewin.cn DESENSITIZE_ENGINE=dev node scripts/public-case-smoke.js
 */
require('dotenv').config()
const fs = require('fs')
const os = require('os')
const path = require('path')
const { PrismaClient } = require('@prisma/client')
const { PUBLIC_CASE_STATUS } = require('../src/constants/v2')

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const STORE_ID = process.env.SMOKE_STORE_ID || 'store_demo_1'
const MERCHANT_USER_ID = process.env.SMOKE_MERCHANT_USER_ID || 'user_demo_1'
const ADMIN_TOKEN = process.env.DEV_ADMIN_TOKEN || process.env.DEV_SYSTEM_TOKEN || 'dev_system_token_change_me'

const prisma = new PrismaClient()

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function api(method, apiPath, { token, body, headers = {} } = {}) {
  const res = await fetch(`${BASE}/api/v1${apiPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || (json.code != null && json.code !== 0)) {
    throw new Error(`${method} ${apiPath} -> ${res.status} ${JSON.stringify(json)}`)
  }
  return json.data
}

function isDesensitizedUrl(url) {
  if (!url) return false
  const v = String(url)
  return (
    v.includes('/files/uploads/desensitized/') ||
    v.includes('/media/files/uploads/desensitized/') ||
    v.startsWith('mock://desensitized/')
  )
}

function assertNoRawInPayload(obj) {
  const text = JSON.stringify(obj)
  assert(!text.includes('rawUrl'), '响应不得含 rawUrl')
  assert(!text.includes('/media/raw/'), '响应不得含 /media/raw/ 占位原图')
  const uploadMatches = text.match(/\/files\/uploads\/\d{4}\/\d{2}\/[^"\\]+/g) || []
  const rawUploads = uploadMatches.filter((u) => !u.includes('/desensitized/'))
  assert(rawUploads.length === 0, `响应含非脱敏 uploads 路径: ${rawUploads.slice(0, 2).join(', ')}`)
}

async function createTinyJpeg() {
  const sharp = require('sharp')
  const file = path.join(os.tmpdir(), `pc_smoke_${Date.now()}.jpg`)
  await sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 180, g: 200, b: 220 } },
  })
    .jpeg()
    .toFile(file)
  return file
}

async function uploadImage(token, filePath) {
  const blob = new Blob([fs.readFileSync(filePath)], { type: 'image/jpeg' })
  const form = new FormData()
  form.append('file', blob, path.basename(filePath))
  const res = await fetch(`${BASE}/api/v1/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.code !== 0) {
    throw new Error(`upload -> ${res.status} ${JSON.stringify(json)}`)
  }
  const url = json.data?.url || json.data?.persistentUrl || json.data?.fileUrl
  assert(url, 'upload 未返回 url')
  return url
}

async function resolveMerchantToken() {
  const { buildAuthSession } = require('../src/services/auth.service')
  const owner = await prisma.user.findUnique({ where: { id: MERCHANT_USER_ID } })
  assert(owner, `商家用户不存在: ${MERCHANT_USER_ID}，请先 npm run db:seed`)
  const session = await buildAuthSession(owner)
  assert(session.roles?.includes('merchant'), 'JWT 无 merchant 角色')
  return { token: session.token, merchantId: session.merchant.merchantId }
}

async function cleanup({ albumId, caseId }) {
  if (caseId) {
    await prisma.caseReviewLog.deleteMany({ where: { caseId } }).catch(() => {})
    await prisma.publicCase.deleteMany({ where: { id: caseId } }).catch(() => {})
  }
  if (albumId) {
    await prisma.desensitizeAsset.deleteMany({
      where: { task: { bizId: albumId } },
    }).catch(() => {})
    await prisma.desensitizeTask.deleteMany({ where: { bizId: albumId } }).catch(() => {})
    await prisma.albumImage.deleteMany({ where: { albumId } }).catch(() => {})
    await prisma.albumNode.deleteMany({ where: { albumId } }).catch(() => {})
    await prisma.albumAuthorization.deleteMany({ where: { albumId } }).catch(() => {})
    await prisma.album.deleteMany({ where: { id: albumId } }).catch(() => {})
  }
}

async function main() {
  console.log('[smoke] H5-A-01 冷启动公开案例全流程')
  console.log('[smoke] BASE =', BASE)
  console.log('[smoke] DESENSITIZE_ENGINE =', process.env.DESENSITIZE_ENGINE || '(default aliyun)')

  const health = await api('GET', '/health')
  assert(health && health.ok !== false, 'health 失败')

  const { token: merchantToken, merchantId } = await resolveMerchantToken()
  console.log('[smoke] merchant', merchantId, STORE_ID)

  let tmpFile = ''
  let albumId = ''
  let caseId = ''

  try {
    tmpFile = await createTinyJpeg()
    const imageUrl = await uploadImage(merchantToken, tmpFile)
    console.log('[smoke] 上传图片 OK')

    const album = await api('POST', '/merchant/service-albums', {
      token: merchantToken,
      body: {
        storeId: STORE_ID,
        serviceName: 'H5-A-01 冒烟保养',
        vehicle: { brand: '大众', series: '朗逸' },
        planAmount: 399,
      },
    })
    albumId = album.albumId || album.id
    assert(albumId, '创建相册失败')
    console.log('[smoke] 创建相册', albumId)

    await api('POST', `/merchant/service-albums/${albumId}`, {
      token: merchantToken,
      body: {
        storeId: STORE_ID,
        nodes: [
          {
            id: 'stage_1',
            title: '接车记录',
            status: 'completed',
            note: '冒烟',
            images: [imageUrl],
          },
          { id: 'stage_2', title: '检测诊断', status: 'pending', note: '', images: [] },
          { id: 'stage_3', title: '方案与报价', status: 'pending', note: '', images: [] },
          { id: 'stage_4', title: '配件告知', status: 'pending', note: '', images: [] },
          { id: 'stage_5', title: '施工记录', status: 'pending', note: '', images: [] },
          { id: 'stage_6', title: '完工交付', status: 'pending', note: '', images: [] },
        ],
      },
    })

    const complete = await api('POST', `/merchant/service-albums/${albumId}/complete`, {
      token: merchantToken,
      body: { storeId: STORE_ID },
    })
    assert(complete.preMaskStatus, `pre-mask 状态: ${complete.preMaskStatus}`)
    console.log('[smoke] 完工 + pre-mask', complete.preMaskStatus)

    const preview = await api('POST', `/merchant/service-albums/${albumId}/cold-start-preview`, {
      token: merchantToken,
      body: { storeId: STORE_ID },
    })
    const taskId = preview.taskId || preview.task?.taskId
    assert(taskId, 'cold-start-preview 无 taskId')
    console.log('[smoke] 冷启动预览 task', taskId)

    await api('POST', `/desensitize/tasks/${taskId}/confirm`, {
      token: merchantToken,
      body: { liabilityAccepted: true },
    })
    console.log('[smoke] 脱敏确认 OK')

    const submitted = await api('POST', `/merchant/service-albums/${albumId}/public-case`, {
      token: merchantToken,
      body: { storeId: STORE_ID, taskId },
    })
    caseId = submitted.caseItem?.id || submitted.id
    assert(submitted.status === PUBLIC_CASE_STATUS.PENDING_REVIEW, '提交后应为 pending_review')
    console.log('[smoke] 提交公开案例', caseId)

    const adminDetail = await api('GET', `/admin/cases/${caseId}`, {
      token: ADMIN_TOKEN,
      headers: { 'X-Client-Type': 'admin' },
    })
    assertNoRawInPayload(adminDetail)
    assert(adminDetail.source === 'cold_start' || adminDetail.sourceLabel, '运营详情应有来源')
    assert(
      !adminDetail.desensitizeSummary?.hasBlockingIssues,
      '运营详情仍有脱敏阻塞项'
    )
    console.log('[smoke] 运营详情 OK（无 rawUrl，来源=', adminDetail.sourceLabel || adminDetail.source, ')')

    const approved = await api('POST', `/admin/cases/${caseId}/approve`, {
      token: ADMIN_TOKEN,
      headers: { 'X-Client-Type': 'admin' },
      body: { comment: 'H5-A-01 冒烟通过' },
    })
    assert(approved.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED, '审核通过后状态错误')
    console.log('[smoke] 运营审核通过')

    const userDetail = await api('GET', `/user/cases/${caseId}`)
    assert(userDetail.storeId === STORE_ID, `storeId 应为 ${STORE_ID}`)
    assertNoRawInPayload(userDetail)
    assert(userDetail.seo && userDetail.seo.title, '应有 seo.title')
    assert(userDetail.seo.slug, '审核通过后应有 seo.slug')
    assert(
      userDetail.seo.canonicalPath &&
        userDetail.seo.canonicalPath.indexOf('/case/') === 0 &&
        userDetail.seo.canonicalPath.endsWith('.html'),
      'canonicalPath 应为 slug 页'
    )
    assert(userDetail.article && userDetail.article.hasArticle, '审核通过后 article.hasArticle 应为 true')
    assert(userDetail.article.body, '应有 article.body')
    assert(Array.isArray(userDetail.article.sections) && userDetail.article.sections.length >= 3, '应有 article.sections')
    if (userDetail.coverImage) {
      assert(isDesensitizedUrl(userDetail.coverImage), '封面应为脱敏 URL')
    }
    console.log('[smoke] 用户读 API OK storeId=', userDetail.storeId)

    const dbRow = await prisma.publicCase.findUnique({ where: { id: caseId } })
    assert(dbRow?.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED, 'DB 状态应为 public_approved')
    assert(dbRow?.storeId === STORE_ID, 'DB storeId 对齐')
    assert(dbRow?.slug, 'DB 应有 slug')
    console.log('[smoke] ✅ H5-A-01 全流程通过', caseId, 'slug=', dbRow.slug)
  } finally {
    if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
    if (process.env.SMOKE_KEEP_DATA !== '1') {
      await cleanup({ albumId, caseId })
      console.log('[smoke] 已清理测试数据（SMOKE_KEEP_DATA=1 可保留）')
    }
  }
}

main()
  .catch((e) => {
    console.error('[smoke] ❌', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
