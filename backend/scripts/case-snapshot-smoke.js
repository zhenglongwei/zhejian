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
  let res
  try {
    res = await fetch(`${BASE}/api/v1${apiPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    const cause = err && (err.cause || err)
    const code = cause && (cause.code || cause.errno)
    throw new Error(
      [
        `无法连接 API ${BASE}${apiPath ? `/api/v1${apiPath}` : ''}（${method}）`,
        code ? `code=${code}` : '',
        (err && err.message) || 'fetch failed',
        '请先启动 backend（如 pm2 / npm run start），或设置 SMOKE_BASE_URL 指向实际地址',
      ]
        .filter(Boolean)
        .join(' · ')
    )
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok || (json.code != null && json.code !== 0)) {
    const e = new Error(`${method} ${apiPath} -> ${res.status} ${JSON.stringify(json)}`)
    e.status = res.status
    throw e
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
  assert(
    owner,
    `商家用户不存在: ${MERCHANT_USER_ID}。预发/生产无本地 seed 时请设置环境变量，例如：\n` +
      `  SMOKE_MERCHANT_USER_ID=实际商家用户ID SMOKE_USER_ID=实际车主用户ID SMOKE_STORE_ID=实际门店ID\n` +
      `或仅本地：npm run db:seed 后再跑（勿在生产库随意 seed）`
  )
  const session = await buildAuthSession(owner)
  return { token: session.token, merchantId: session.merchant.merchantId }
}

async function resolveUserToken() {
  const { buildAuthSession } = require('../src/services/auth.service')
  const user = await prisma.user.findUnique({ where: { id: USER_ID } })
  assert(
    user,
    `用户不存在: ${USER_ID}。请设置 SMOKE_USER_ID（车主须有手机号，且与相册关联手机一致；默认 seed 为 user_demo_1）`
  )
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

  try {
    await api('GET', '/health')
  } catch (err) {
    throw new Error(
      `${err.message}\n提示：冒烟脚本不会自己起服务。staging 上先确认 API 在监听，例如：\n` +
        `  curl -sS ${BASE}/api/v1/health\n` +
        `  pm2 list   # 或 systemctl / docker 看 backend 是否 online`
    )
  }
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
    assert(
      published.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED ||
        published.autoApproved === true,
      '提交后应直接公开（不再经闸门 B）'
    )
    assert(published.caseItem?.snapshotVersion === 1, '首次 snapshotVersion 应为 1')

    const rowV1 = await prisma.publicCase.findUnique({ where: { id: caseId } })
    assert(rowV1.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED, '发布后 publicCase 应为已通过')
    const snapV1 = extractSnapshotFromContentJson(rowV1.contentJson)
    assert(snapV1 && snapV1.version === 1, 'snapshot.version 应为 1')
    assert(snapV1.nodes.some((n) => (n.note || '').includes('SNAP_V1')), 'snapshot 应冻结 V1 note')

    const lockedAlbum = await prisma.album.findUnique({
      where: { id: albumId },
      include: { authorization: true },
    })
    assert(isAlbumContentLocked(lockedAlbum), '发布后相册应锁定')

    const slug = rowV1.slug
    assert(slug, '应有 slug')
    await assertH5Readable({
      caseId,
      slug,
      snapshotMarker: SNAP_V1_TAG,
      labelPrefix: 'FLOW-01',
    })
    log('FLOW-01', '✅ 建册→发布直上 H5 OK')

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
    const stillLocked = await prisma.album.findUnique({
      where: { id: albumId },
      include: { authorization: true },
    })
    assert(isAlbumContentLocked(stillLocked), '撤回后相册仍应锁定')
    assert(
      stillLocked.complianceStatus === 'passed' || stillLocked.complianceStatus === 'spot_check',
      '撤回后应保留一审通过态'
    )
    log('FLOW-03', '用户撤回后仍锁定 OK')

    let saveAfterWithdraw = false
    try {
      await api('POST', `/merchant/service-albums/${albumId}`, {
        token: merchantToken,
        body: { storeId: STORE_ID, storeNote: '撤回后尝试修改' },
      })
    } catch (err) {
      saveAfterWithdraw = String(err.message || '').includes(ALBUM_CONTENT_LOCKED_MESSAGE) ||
        Number(err.status) === 409
    }
    assert(saveAfterWithdraw, '撤回后 merchant save 仍应 409')

    const authTaskId2 = await userConfirmAuthorizePreview(userToken, albumId)
    const republished = await userAuthorizeAndPublish({ userToken, albumId, authTaskId: authTaskId2 })
    assert(republished.caseItem?.snapshotVersion === 2, '再发布 snapshotVersion 应为 2')
    assert(
      republished.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED || republished.autoApproved === true,
      '再发布应直接公开'
    )

    const rowV2 = await prisma.publicCase.findUnique({ where: { id: caseId } })
    const snapV2 = extractSnapshotFromContentJson(rowV2.contentJson)
    assert(snapV2 && snapV2.version === 2, 'snapshot.version 应为 2')
    assert(snapV2.nodes.some((n) => (n.note || '').includes('SNAP_V1')), '再发布仍冻结原锁定内容（商家未改）')
    assert(rowV2.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED, '再发布后应为已通过')

    await assertH5Readable({
      caseId,
      slug: rowV2.slug || slug,
      snapshotMarker: SNAP_V1_TAG,
      labelPrefix: 'FLOW-03',
    })
    log('FLOW-03', '✅ 撤回→仍锁定→再发布直上 OK')

    console.log('[case-snapshot-smoke] ALL OK', {
      albumId,
      caseId,
      snapshotVersions: [1, 2],
      slug,
    })
    if (process.env.SMOKE_KEEP_DATA !== '1') {
      log(
        'hint',
        `ENR-06: SMOKE_KEEP_DATA=1 重跑可保留数据；再执行 SMOKE_CASE_ID=${caseId} npm run case:enrichment-feed-smoke`
      )
    }
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
