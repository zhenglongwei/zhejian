/**
 * CASE-FLOW-01～03 · 用户授权快照全链路冒烟
 *
 * FLOW-01: 商家建册 → 完工合规 → 用户授权 → 提交公示 → 运营 B 通过 → H5/读 API
 * FLOW-02: 授权后篡改 live album → 读侧仍返回 snapshot（漂移回归）
 * FLOW-03: 撤回 → 商家改相册 → 再授权 → snapshotVersion++ → 重审
 *
 * 用法（本地，需 API 已启动）：
 *   npm run db:seed
 *   DESENSITIZE_ENGINE=dev npm run dev          # 另开终端
 *   DESENSITIZE_ENGINE=dev node scripts/case-snapshot-smoke.js
 *
 * 环境变量：
 *   SMOKE_BASE_URL          默认 http://127.0.0.1:3000
 *   SMOKE_STORE_ID          默认 store_demo_1
 *   SMOKE_USER_ID           默认 user_demo_1
 *   SMOKE_USER_PHONE        默认 13812345678
 *   SMOKE_MERCHANT_USER_ID  默认 user_demo_1
 *   DEV_ADMIN_TOKEN         运营 token（仅 DEV_AUTH_ENABLED=true 时有效）
 *   SMOKE_ADMIN_PASSWORD    运营登录密码（生产推荐；默认同 ADMIN_PASSWORD）
 *   SMOKE_KEEP_DATA=1       保留测试数据
 */
require('dotenv').config()
const fs = require('fs')
const os = require('os')
const path = require('path')
const { PrismaClient } = require('@prisma/client')
const { PUBLIC_CASE_STATUS } = require('../src/constants/v2')
const { CASE_ARTICLE_STATUS } = require('../src/constants/case-article-status')
const {
  extractSnapshotFromContentJson,
  resolvePublicCaseContentNodes,
} = require('../src/schemas/case-snapshot.schema')
const {
  isAlbumContentLocked,
  ALBUM_CONTENT_LOCKED_MESSAGE,
} = require('../src/services/service-album.service')
const { mapPublicCaseRow } = require('../src/services/content.service')
const { runAlbumComplianceGate } = require('../src/services/album-compliance.service')

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const STORE_ID = process.env.SMOKE_STORE_ID || 'store_demo_1'
const USER_ID = process.env.SMOKE_USER_ID || 'user_demo_1'
const USER_PHONE = process.env.SMOKE_USER_PHONE || '13812345678'
const MERCHANT_USER_ID = process.env.SMOKE_MERCHANT_USER_ID || 'user_demo_1'

const SNAP_V1_TAG = 'SNAP_V1'
const SNAP_V2_TAG = 'SNAP_V2'
const SNAP_V1_NOTE = `${SNAP_V1_TAG}_检测：前制动片磨损`
const SNAP_V2_NOTE = `${SNAP_V2_TAG}_检测：已更换制动片`
const DRIFT_TITLE = 'DRIFT_AFTER_AUTH_不应出现在H5'

const prisma = new PrismaClient()

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function log(step, detail = '') {
  console.log(`[case-snapshot-smoke] ${step}${detail ? ` · ${detail}` : ''}`)
}

async function resolveAdminToken() {
  if (process.env.SMOKE_ADMIN_TOKEN) {
    return process.env.SMOKE_ADMIN_TOKEN
  }

  const devToken = process.env.DEV_ADMIN_TOKEN || process.env.DEV_SYSTEM_TOKEN || ''
  if (devToken && process.env.DEV_AUTH_ENABLED !== 'false') {
    return devToken
  }

  const password = process.env.SMOKE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || ''
  if (!password) {
    if (devToken) {
      log('warn', 'DEV_AUTH_ENABLED=false，dev token 无效；请设 ADMIN_PASSWORD 或 SMOKE_ADMIN_PASSWORD')
    }
    throw new Error(
      '无法获取运营 token：请设置 SMOKE_ADMIN_TOKEN、或 ADMIN_PASSWORD（.env）、或 DEV_AUTH_ENABLED=true + DEV_ADMIN_TOKEN'
    )
  }

  const res = await fetch(`${BASE}/api/v1/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.code !== 0 || !json.data?.token) {
    throw new Error(`admin login -> ${res.status} ${JSON.stringify(json)}`)
  }
  log('auth', '已用 ADMIN_PASSWORD 签发运营 JWT')
  return json.data.token
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

async function createTinyJpeg() {
  const sharp = require('sharp')
  const file = path.join(os.tmpdir(), `case_flow_${Date.now()}.jpg`)
  await sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 120, g: 160, b: 200 } },
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
  assert(owner, `商家用户不存在: ${MERCHANT_USER_ID}`)
  const session = await buildAuthSession(owner)
  return { token: session.token, merchantId: session.merchant.merchantId }
}

async function resolveUserToken() {
  const { buildAuthSession } = require('../src/services/auth.service')
  const user = await prisma.user.findUnique({ where: { id: USER_ID } })
  assert(user, `用户不存在: ${USER_ID}`)
  const session = await buildAuthSession(user)
  return session.token
}

async function waitForPreMaskReady(albumId, attempts = 30) {
  const { buildPreMaskTaskId } = require('../src/services/desensitize.constants')
  const taskId = buildPreMaskTaskId(albumId)
  for (let i = 0; i < attempts; i += 1) {
    const task = await prisma.desensitizeTask.findUnique({
      where: { taskId },
      include: { assets: true },
    })
    if (task && task.assets.length && task.preMaskStatus !== 'running') {
      return task
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('pre-mask 超时未就绪')
}

async function userAuthorizeAndPublish({
  userToken,
  albumId,
  authTaskId,
}) {
  await api('POST', `/user/service-albums/${albumId}/authorization`, {
    token: userToken,
    body: { agreed: true, tier: 'named' },
  })

  const published = await api('POST', `/user/service-albums/${albumId}/public-case`, {
    token: userToken,
    body: authTaskId ? { taskId: authTaskId } : {},
  })
  return published
}

async function userConfirmAuthorizePreview(userToken, albumId) {
  const preview = await api('POST', `/user/albums/${albumId}/authorize-preview`, {
    token: userToken,
  })
  const taskId = preview.taskId || preview.task?.taskId
  assert(taskId, 'authorize-preview 无 taskId')
  await api('POST', `/desensitize/tasks/${taskId}/confirm`, {
    token: userToken,
    body: { liabilityAccepted: true },
  })
  return taskId
}

async function loadAlbumNodesForSave(albumId, patch = {}) {
  const nodes = await prisma.albumNode.findMany({
    where: { albumId },
    orderBy: { sortOrder: 'asc' },
  })
  const images = await prisma.albumImage.findMany({
    where: { albumId },
    orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }],
  })
  const imagesByNode = images.reduce((acc, img) => {
    if (!acc[img.nodeId]) acc[img.nodeId] = []
    acc[img.nodeId].push(img.rawUrl)
    return acc
  }, {})

  return nodes.map((node) => {
    const nodeId = node.nodeId
    const patchItem = patch[nodeId] || {}
    return {
      id: nodeId,
      title: patchItem.title ?? node.title,
      status: patchItem.status ?? node.status,
      note: patchItem.note ?? node.note,
      images: imagesByNode[nodeId] || [],
    }
  })
}

function findNodeText(payload, stageId = 'stage_2') {
  const nodes = payload?.nodes || payload?.content?.nodes || []
  const node = nodes.find((n) => n.id === stageId || n.nodeId === stageId)
  return {
    title: node?.title || '',
    note: node?.note || node?.description || '',
  }
}

function assertNodeNoteContains(payload, expectedSubstring, label) {
  const { note } = findNodeText(payload)
  const articleText = JSON.stringify({
    body: payload?.article?.body,
    sections: payload?.article?.sections,
    nodes: payload?.nodes,
  })
  assert(
    note.includes(expectedSubstring) || articleText.includes(expectedSubstring),
    `${label} 应含「${expectedSubstring}」，节点 note=「${note}」`
  )
}

async function assertH5Readable({ caseId, slug, snapshotMarker = SNAP_V1_TAG, labelPrefix }) {
  assert(snapshotMarker, `${labelPrefix} 缺少 snapshotMarker`)
  const userDetail = await api('GET', `/user/cases/${caseId}`)
  assertNodeNoteContains(userDetail, snapshotMarker, `${labelPrefix} 用户读 API`)
  assert(userDetail.article?.hasArticle, '应有 article.hasArticle')

  if (userDetail.seo?.noindex) {
    log(labelPrefix, 'seo.noindex · 跳过 Feed JSON（演示门店预期行为）')
    return userDetail
  }

  const feed = await api('GET', `/public/v1/cases/${encodeURIComponent(slug || caseId)}.json`)
  assertNodeNoteContains(feed, snapshotMarker, `${labelPrefix} H5 Feed JSON`)
  return userDetail
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
    await prisma.albumAuthorization.deleteMany({ where: { albumId } }).catch(() => {})
    await prisma.albumImage.deleteMany({ where: { albumId } }).catch(() => {})
    await prisma.albumNode.deleteMany({ where: { albumId } }).catch(() => {})
    await prisma.album.deleteMany({ where: { id: albumId } }).catch(() => {})
  }
}

async function main() {
  log('start', `BASE=${BASE} DESENSITIZE_ENGINE=${process.env.DESENSITIZE_ENGINE || '(default)'}`)

  await api('GET', '/health')
  const adminToken = await resolveAdminToken()
  await api('GET', '/admin/cases?page=1&pageSize=1', {
    token: adminToken,
    headers: { 'X-Client-Type': 'admin' },
  })
  log('auth', '运营 token 校验通过')
  const { token: merchantToken } = await resolveMerchantToken()
  const userToken = await resolveUserToken()

  let tmpFile = ''
  let albumId = ''
  let caseId = ''
  const stamp = Math.random().toString(36).slice(2, 8)

  try {
    tmpFile = await createTinyJpeg()
    const imageUrl = await uploadImage(merchantToken, tmpFile)

    const album = await api('POST', '/merchant/service-albums', {
      token: merchantToken,
      body: {
        storeId: STORE_ID,
        serviceName: `CASE-FLOW 冒烟 ${stamp}`,
        userPhone: USER_PHONE,
        vehicle: { brand: '大众', series: '朗逸' },
        planAmount: 399,
      },
    })
    albumId = album.albumId || album.id
    assert(albumId, '创建相册失败')
    log('FLOW-01', `相册 ${albumId}`)

    await api('POST', `/merchant/service-albums/${albumId}`, {
      token: merchantToken,
      body: {
        storeId: STORE_ID,
        nodes: [
          {
            id: 'stage_1',
            title: '接车记录',
            status: 'completed',
            note: '用户反馈刹车异响',
            images: [imageUrl],
          },
          {
            id: 'stage_2',
            title: '检测诊断',
            status: 'completed',
            note: SNAP_V1_NOTE,
            images: [],
          },
          {
            id: 'stage_3',
            title: '方案与报价',
            status: 'completed',
            note: '更换前制动片',
            images: [],
          },
          { id: 'stage_4', title: '配件告知', status: 'pending', note: '', images: [] },
          { id: 'stage_5', title: '施工记录', status: 'pending', note: '', images: [] },
          {
            id: 'stage_6',
            title: '完工交付',
            status: 'completed',
            note: '试车制动正常',
            images: [],
          },
        ],
      },
    })

    const complete = await api('POST', `/merchant/service-albums/${albumId}/complete`, {
      token: merchantToken,
      body: { storeId: STORE_ID },
    })
    if (!complete.compliancePassed && complete.complianceStatus === 'spot_check') {
      log('FLOW-01', '命中抽检，运营 Gate A 通过')
      await api('POST', `/admin/album-compliance/${albumId}/approve`, {
        token: adminToken,
        headers: { 'X-Client-Type': 'admin' },
        body: { comment: 'CASE-FLOW smoke 抽检通过' },
      })
    } else {
      assert(complete.compliancePassed, `合规应通过，status=${complete.complianceStatus}`)
    }
    await waitForPreMaskReady(albumId)
    log('FLOW-01', '完工 + 合规 + pre-mask OK')

    const authTaskId = await userConfirmAuthorizePreview(userToken, albumId)
    const published = await userAuthorizeAndPublish({ userToken, albumId, authTaskId })
    caseId = published.caseItem?.id || published.id
    assert(published.status === PUBLIC_CASE_STATUS.PENDING_REVIEW, '提交后应为 pending_review')
    assert(published.caseItem?.snapshotVersion === 1, '首次 snapshotVersion 应为 1')

    const rowV1 = await prisma.publicCase.findUnique({ where: { id: caseId } })
    const snapV1 = extractSnapshotFromContentJson(rowV1.contentJson)
    assert(snapV1 && snapV1.version === 1, 'snapshot.version 应为 1')
    assert(snapV1.nodes.some((n) => (n.note || '').includes('SNAP_V1')), 'snapshot 应冻结 V1 note')

    const lockedAlbum = await prisma.album.findUnique({
      where: { id: albumId },
      include: { authorization: true },
    })
    assert(isAlbumContentLocked(lockedAlbum), '授权后相册应锁定')

    const approved = await api('POST', `/admin/cases/${caseId}/approve`, {
      token: adminToken,
      headers: { 'X-Client-Type': 'admin' },
      body: { comment: 'CASE-FLOW-01 冒烟通过' },
    })
    assert(approved.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED, '审核通过后状态错误')
    assert(approved.snapshotFrozen === true, '运营详情应标记 snapshotFrozen')
    log('FLOW-01', `运营通过 slug=${approved.slug || rowV1.slug}`)

    const slug = approved.slug || rowV1.slug
    assert(slug, '应有 slug')
    await assertH5Readable({
      caseId,
      slug,
      snapshotMarker: SNAP_V1_TAG,
      labelPrefix: 'FLOW-01',
    })
    log('FLOW-01', '✅ 建册→授权→审核→H5 OK')

    await prisma.albumNode.updateMany({
      where: { albumId, nodeId: 'stage_2' },
      data: { title: DRIFT_TITLE, note: 'DRIFT_NOTE_不应读侧可见' },
    })
    log('FLOW-02', '已注入 live album 漂移')

    const driftRow = await prisma.publicCase.findUnique({ where: { id: caseId } })
    const mapped = mapPublicCaseRow(driftRow, {
      nodes: [{ id: 'stage_2', title: DRIFT_TITLE, note: 'DRIFT_NOTE_不应读侧可见' }],
    })
    assert(
      !mapped.nodes.some((n) => n.title === DRIFT_TITLE),
      'mapPublicCaseRow 不应返回漂移 title'
    )
    assertNodeNoteContains(mapped, 'SNAP_V1', 'mapPublicCaseRow')

    const nodesFromJson = resolvePublicCaseContentNodes(driftRow.contentJson)
    assert(
      nodesFromJson.some((n) => (n.note || '').includes('SNAP_V1')),
      'resolvePublicCaseContentNodes 应读 snapshot'
    )

    await assertH5Readable({
      caseId,
      slug,
      snapshotMarker: SNAP_V1_TAG,
      labelPrefix: 'FLOW-02 漂移后',
    })

    let saveBlocked = false
    try {
      await api('POST', `/merchant/service-albums/${albumId}`, {
        token: merchantToken,
        body: { storeId: STORE_ID, storeNote: '漂移后尝试修改' },
      })
    } catch (err) {
      saveBlocked = String(err.message || '').includes(ALBUM_CONTENT_LOCKED_MESSAGE)
    }
    assert(saveBlocked, '漂移后 merchant save 仍应 409')
    log('FLOW-02', '✅ 漂移回归 OK')

    await api('POST', `/user/service-albums/${albumId}/withdraw-authorization`, {
      token: userToken,
    })
    const unlocked = await prisma.album.findUnique({
      where: { id: albumId },
      include: { authorization: true },
    })
    assert(!isAlbumContentLocked(unlocked), '撤回后相册应解锁')
    log('FLOW-03', '用户撤回 OK')

    await api('POST', `/merchant/service-albums/${albumId}`, {
      token: merchantToken,
      body: {
        storeId: STORE_ID,
        nodes: await loadAlbumNodesForSave(albumId, {
          stage_2: { note: SNAP_V2_NOTE },
        }),
      },
    })
    const compliance = await runAlbumComplianceGate(albumId)
    assert(compliance.passed, '再授权前合规应通过')
    await waitForPreMaskReady(albumId)

    const authTaskId2 = await userConfirmAuthorizePreview(userToken, albumId)
    const republished = await userAuthorizeAndPublish({ userToken, albumId, authTaskId: authTaskId2 })
    assert(republished.caseItem?.snapshotVersion === 2, '再授权 snapshotVersion 应为 2')
    assert(republished.status === PUBLIC_CASE_STATUS.PENDING_REVIEW, '再授权应 pending_review')

    const rowV2 = await prisma.publicCase.findUnique({ where: { id: caseId } })
    const snapV2 = extractSnapshotFromContentJson(rowV2.contentJson)
    assert(snapV2 && snapV2.version === 2, 'snapshot.version 应为 2')
    assert(snapV2.nodes.some((n) => (n.note || '').includes('SNAP_V2')), 'snapshot 应冻结 V2 note')

    const approved2 = await api('POST', `/admin/cases/${caseId}/approve`, {
      token: adminToken,
      headers: { 'X-Client-Type': 'admin' },
      body: { comment: 'CASE-FLOW-03 再授权通过' },
    })
    assert(approved2.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED, '重审通过状态错误')

    await assertH5Readable({
      caseId,
      slug: approved2.slug || slug,
      snapshotMarker: SNAP_V2_TAG,
      labelPrefix: 'FLOW-03',
    })
    log('FLOW-03', '✅ 撤回→再授权→重审 OK')

    console.log('[case-snapshot-smoke] ALL OK', {
      albumId,
      caseId,
      snapshotVersions: [1, 2],
      slug,
    })
  } finally {
    if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
    if (process.env.SMOKE_KEEP_DATA !== '1') {
      await cleanup({ albumId, caseId })
      log('cleanup', '已清理测试数据（SMOKE_KEEP_DATA=1 可保留）')
    }
  }
}

main()
  .catch((err) => {
    console.error('[case-snapshot-smoke] FAIL', err.message || err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
