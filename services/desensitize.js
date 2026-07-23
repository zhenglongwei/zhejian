/**
 * 图片脱敏任务 — V1 mock（对齐 08_图片脱敏工具PRD）
 * MOCK: 本地 storage；联调走 backend /api/v1/desensitize/*
 */
const { ENV } = require('./config')
const { get, post } = require('./request')
const {
  BIZ_TYPE,
  OPERATOR_ROLE,
  ASSET_STATUS,
  PRE_MASK_STATUS,
} = require('../constants/desensitize')
const { mockDesensitizedUrl } = require('../utils/desensitize-mock')
const { normalizeTaskAssets } = require('../utils/desensitize-url')

const STORAGE_TASKS = 'desensitize_tasks_v1'
const STORAGE_ALBUMS = 'merchant_albums_v1'

function useApi() {
  return ENV.mode !== 'mock'
}

function delay(ms = 320) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadTasks() {
  try {
    return wx.getStorageSync(STORAGE_TASKS) || []
  } catch (e) {
    return []
  }
}

function saveTasks(list) {
  wx.setStorageSync(STORAGE_TASKS, list)
}

function loadAlbums() {
  try {
    return wx.getStorageSync(STORAGE_ALBUMS) || []
  } catch (e) {
    return []
  }
}

function saveAlbums(list) {
  wx.setStorageSync(STORAGE_ALBUMS, list)
}

/** 从相册节点汇总原图列表 */
function collectRawAssetsFromNodes(nodes, albumId) {
  const assets = []
  ;(nodes || []).forEach((node) => {
    ;(node.images || []).forEach((url, index) => {
      if (!url) return
      assets.push({
        id: `${node.id || 'node'}_${index}`,
        nodeId: node.id || 'node',
        nodeTitle: node.title || '过程图',
        index,
        url,
        status: ASSET_STATUS.RAW_UPLOADED,
        previewed: false,
      })
    })
  })
  return assets.map((a) => ({
    ...a,
    maskedUrl: '',
    riskTags: [],
  }))
}

function buildMaskedUrl(rawUrl, albumId, asset) {
  return mockDesensitizedUrl(rawUrl, albumId, asset.nodeId, asset.index)
}

function countReady(assets) {
  const ready = new Set([
    ASSET_STATUS.MASKED_READY,
    ASSET_STATUS.MANUAL_MASKED,
    ASSET_STATUS.CONFIRMED,
  ])
  return (assets || []).filter((a) => ready.has(a.status)).length
}

function allMaskingSucceeded(assets) {
  const list = assets || []
  if (!list.length) return true
  const ok = new Set([
    ASSET_STATUS.MASKED_READY,
    ASSET_STATUS.MANUAL_MASKED,
    ASSET_STATUS.CONFIRMED,
    ASSET_STATUS.MASK_FAILED,
  ])
  return list.every((a) => ok.has(a.status))
}

/**
 * @param {{ bizType: string, bizId: string, nodes: object[] }} params
 */
async function createTask({ bizType = BIZ_TYPE.MERCHANT_HISTORY, bizId, nodes }) {
  await delay()
  const rawAssets = collectRawAssetsFromNodes(nodes, bizId)
  if (!rawAssets.length) {
    const err = new Error('没有待脱敏的图片')
    err.code = 400
    throw err
  }
  const taskId = `task_${bizId}_${Date.now()}`
  const task = {
    taskId,
    bizType,
    bizId,
    operatorRole:
      bizType === BIZ_TYPE.ORDER_AUTHORIZE
        ? OPERATOR_ROLE.USER
        : OPERATOR_ROLE.MERCHANT,
    liabilityType:
      bizType === BIZ_TYPE.ORDER_AUTHORIZE ? 'user' : 'merchant',
    rawAssets,
    maskedAssets: [],
    maskingConfirmed: false,
    maskingConfirmedAt: null,
    updatedAt: Date.now(),
  }
  const list = loadTasks().filter((t) => t.taskId !== taskId)
  list.unshift(task)
  saveTasks(list)

  const albums = loadAlbums()
  const idx = albums.findIndex((a) => a.id === bizId)
  if (idx >= 0) {
    albums[idx] = {
      ...albums[idx],
      maskingTaskId: taskId,
      maskingConfirmed: false,
      maskingConfirmedAt: null,
      updatedAt: Date.now(),
    }
    saveAlbums(albums)
  }
  return task
}

function buildPreMaskTaskId(albumId) {
  return `task_premask_${albumId}`
}

function buildAuthorizeTaskId(albumId) {
  return `task_auth_${albumId}`
}

function nodesFingerprint(nodes) {
  return JSON.stringify(
    (nodes || []).map((n) => ({
      id: n.id,
      images: n.images || [],
    }))
  )
}

function buildPreMaskedAssetsFromNodes(nodes, albumId) {
  const rawAssets = collectRawAssetsFromNodes(nodes, albumId)
  return rawAssets.map((asset) => {
    const preMaskedUrl = mockDesensitizedUrl(
      asset.url,
      albumId,
      asset.nodeId,
      asset.index
    )
    return {
      ...asset,
      maskedUrl: preMaskedUrl,
      preMaskedUrl,
      status: preMaskedUrl ? ASSET_STATUS.MASKED_READY : ASSET_STATUS.MASK_FAILED,
      previewed: false,
      riskTags: preMaskedUrl ? ['plate'] : [],
    }
  })
}

function resolvePreMaskStatus(assets) {
  if (!assets.length) return PRE_MASK_STATUS.READY
  const failed = assets.filter((a) => a.status === ASSET_STATUS.MASK_FAILED).length
  if (failed === assets.length) return PRE_MASK_STATUS.FAILED
  if (failed > 0) return PRE_MASK_STATUS.PARTIAL_FAILED
  return PRE_MASK_STATUS.READY
}

function toMaskedAssets(rawAssets) {
  return (rawAssets || [])
    .filter((a) => a.maskedUrl || a.preMaskedUrl)
    .map((a) => ({
      id: `m_${a.id}`,
      rawId: a.id,
      url: a.maskedUrl || a.preMaskedUrl,
      status: a.status,
    }))
}

function findPreMaskTaskByAlbumId(albumId, bizType) {
  const preMaskTypes = bizType
    ? [bizType]
    : [BIZ_TYPE.ORDER_PRE_MASK, BIZ_TYPE.SERVICE_PRE_MASK]
  const taskId = buildPreMaskTaskId(albumId)
  return loadTasks().find(
    (t) =>
      t.taskId === taskId ||
      (t.bizId === albumId && preMaskTypes.includes(t.bizType))
  )
}

function findAuthorizeTaskByAlbumId(albumId, bizType) {
  const authTypes = bizType
    ? [bizType]
    : [BIZ_TYPE.ORDER_AUTHORIZE, BIZ_TYPE.SERVICE_AUTHORIZE]
  return loadTasks().find(
    (t) =>
      t.bizId === albumId &&
      authTypes.includes(t.bizType) &&
      !t.maskingConfirmed
  )
}

function clearPendingAuthorizeTasks(albumId, bizType) {
  const authTypes = bizType
    ? [bizType]
    : [BIZ_TYPE.ORDER_AUTHORIZE, BIZ_TYPE.SERVICE_AUTHORIZE]
  const list = loadTasks().filter(
    (t) =>
      !(t.bizId === albumId && authTypes.includes(t.bizType) && !t.maskingConfirmed)
  )
  saveTasks(list)
}

/** 迁移旧版独立 storage（order_album_pre_mask_v1）→ 脱敏任务 */
function migrateLegacyPreMaskIfNeeded(albumId, nodes) {
  try {
    const legacyMap = wx.getStorageSync('order_album_pre_mask_v1') || {}
    const legacy = legacyMap[albumId]
    if (!legacy || !legacy.assets || !legacy.assets.length) return null
    if (findPreMaskTaskByAlbumId(albumId)) return null
    const taskId = buildPreMaskTaskId(albumId)
    const task = {
      taskId,
      bizType: BIZ_TYPE.ORDER_PRE_MASK,
      bizId: albumId,
      operatorRole: OPERATOR_ROLE.SYSTEM,
      liabilityType: 'platform',
      fingerprint: legacy.fingerprint || nodesFingerprint(nodes),
      preMaskStatus: legacy.preMaskStatus || PRE_MASK_STATUS.READY,
      preMaskVersion: legacy.preMaskVersion || 1,
      preMaskedAt: legacy.preMaskedAt || new Date().toISOString(),
      rawAssets: legacy.assets,
      maskedAssets: toMaskedAssets(legacy.assets),
      maskingConfirmed: false,
      maskingConfirmedAt: null,
      updatedAt: Date.now(),
    }
    persistTask(task)
    delete legacyMap[albumId]
    wx.setStorageSync('order_album_pre_mask_v1', legacyMap)
    return task
  } catch (e) {
    return null
  }
}

/**
 * 商家提交完工后：创建/更新 order_pre_mask 脱敏任务（不对用户展示 UI）
 * @param {string} albumId
 * @param {object[]} nodes
 */
async function ensureOrderPreMaskTask(albumId, nodes, options = {}) {
  if (useApi()) {
    const task = await post(`/system/albums/${albumId}/pre-mask`, {
      force: Boolean(options.force),
    })
    return normalizeTaskAssets(task)
  }
  await delay(options.instant ? 0 : 180)
  migrateLegacyPreMaskIfNeeded(albumId, nodes)

  const preMaskBizType = options.preMaskBizType || BIZ_TYPE.ORDER_PRE_MASK
  const fingerprint = nodesFingerprint(nodes)
  const existing = findPreMaskTaskByAlbumId(albumId, preMaskBizType)
  if (
    existing &&
    existing.fingerprint === fingerprint &&
    (existing.preMaskStatus === PRE_MASK_STATUS.READY ||
      existing.preMaskStatus === PRE_MASK_STATUS.PARTIAL_FAILED) &&
    !options.force
  ) {
    return existing
  }

  if (
    existing &&
    existing.fingerprint !== fingerprint
  ) {
    clearPendingAuthorizeTasks(albumId, options.authorizeBizType)
  }

  const taskId = buildPreMaskTaskId(albumId)
  const runningTask = {
    ...(existing || {}),
    taskId,
    bizType: preMaskBizType,
    bizId: albumId,
    operatorRole: OPERATOR_ROLE.SYSTEM,
    liabilityType: 'platform',
    fingerprint,
    preMaskStatus: PRE_MASK_STATUS.RUNNING,
    preMaskVersion: (existing && existing.preMaskVersion ? existing.preMaskVersion : 0) + 1,
    preMaskedAt: null,
    rawAssets: existing && existing.rawAssets ? existing.rawAssets : [],
    maskedAssets: [],
    maskingConfirmed: false,
    maskingConfirmedAt: null,
    updatedAt: Date.now(),
  }
  persistTask(runningTask)

  await delay(options.instant ? 0 : 120)
  const rawAssets = buildPreMaskedAssetsFromNodes(nodes, albumId)
  const preMaskStatus = resolvePreMaskStatus(rawAssets)
  const task = {
    ...runningTask,
    preMaskStatus,
    preMaskedAt: new Date().toISOString(),
    rawAssets,
    maskedAssets: toMaskedAssets(rawAssets),
    updatedAt: Date.now(),
  }
  persistTask(task)
  return task
}

async function ensureServicePreMaskTask(albumId, nodes, options = {}) {
  return ensureOrderPreMaskTask(albumId, nodes, {
    ...options,
    preMaskBizType: BIZ_TYPE.SERVICE_PRE_MASK,
    authorizeBizType: BIZ_TYPE.SERVICE_AUTHORIZE,
  })
}

function persistTask(task) {
  const list = loadTasks()
  const next = list.map((t) => (t.taskId === task.taskId ? task : t))
  if (!next.find((t) => t.taskId === task.taskId)) next.unshift(task)
  saveTasks(next)
  return task
}

/**
 * 用户确认脱敏并授权公开（订单相册 order_authorize，不写 merchant_albums）
 */
async function confirmOrderAuthorizeTask(taskId, opts = {}) {
  if (useApi()) {
    const data = await post(`/desensitize/tasks/${taskId}/confirm`, {
      liabilityAccepted: Boolean(opts.liabilityAccepted),
    })
    if (data && data.task) {
      return { task: normalizeTaskAssets(data.task) }
    }
    return data
  }
  if (!opts.liabilityAccepted) {
    const err = new Error('请勾选责任确认')
    err.code = 400
    throw err
  }
  await delay(320)
  let task = await fetchTask(taskId)
  const confirmTypes = [
    BIZ_TYPE.ORDER_AUTHORIZE,
    BIZ_TYPE.SERVICE_AUTHORIZE,
    BIZ_TYPE.MERCHANT_HISTORY,
  ]
  if (!confirmTypes.includes(task.bizType)) {
    const err = new Error('任务类型不匹配')
    err.code = 400
    throw err
  }
  if (!allMaskingSucceeded(task.rawAssets)) {
    const err = new Error('仍有图片未完成脱敏')
    err.code = 400
    throw err
  }
  const rawAssets = (task.rawAssets || []).map((a) => ({
    ...a,
    status: ASSET_STATUS.CONFIRMED,
    previewed: true,
  }))
  task = persistTask({
    ...task,
    rawAssets,
    maskingConfirmed: true,
    maskingConfirmedAt: Date.now(),
    updatedAt: Date.now(),
  })
  return { task }
}

async function fetchTask(taskId) {
  if (useApi()) {
    return normalizeTaskAssets(await get(`/desensitize/tasks/${taskId}`))
  }
  await delay()
  const task = loadTasks().find((t) => t.taskId === taskId)
  if (!task) {
    const err = new Error('脱敏任务不存在')
    err.code = 404
    throw err
  }
  return task
}

function shouldRunOrderPreMask(albumStatus) {
  return ['completed', 'report_generated'].includes(albumStatus)
}

function shouldRunServicePreMask(albumStatus) {
  return ['completed', 'pending_authorization', 'published'].includes(albumStatus)
}

/**
 * 基于 order_pre_mask 任务创建用户授权预览任务（order_authorize）
 */
async function createOrderAuthorizeTaskFromPreMask({ bizId, orderId, nodes }) {
  if (useApi()) {
    if (!orderId) {
      const err = new Error('缺少订单 ID')
      err.code = 400
      throw err
    }
    const preview = await post(`/user/orders/${orderId}/album/authorize-preview`)
    return fetchTask(preview.taskId)
  }
  await delay(120)
  let preMaskTask = findPreMaskTaskByAlbumId(bizId)
  if (
    !preMaskTask ||
    preMaskTask.preMaskStatus === PRE_MASK_STATUS.RUNNING ||
    preMaskTask.preMaskStatus === PRE_MASK_STATUS.IDLE
  ) {
    if (nodes && nodes.length) {
      preMaskTask = await ensureOrderPreMaskTask(bizId, nodes, { instant: true })
    }
  }
  if (!preMaskTask) {
    const err = new Error('预脱敏尚未就绪，请稍后再试')
    err.code = 409
    throw err
  }

  const existing = findAuthorizeTaskByAlbumId(bizId)
  if (
    existing &&
    existing.preMaskTaskId === preMaskTask.taskId &&
    existing.preMaskVersion === preMaskTask.preMaskVersion
  ) {
    return existing
  }
  if (existing) {
    clearPendingAuthorizeTasks(bizId)
  }

  const rawAssets = (preMaskTask.rawAssets || []).map((asset) => ({
    ...asset,
    maskedUrl: asset.maskedUrl || asset.preMaskedUrl || '',
    previewed: false,
  }))
  const authTaskId = buildAuthorizeTaskId(bizId)
  const task = {
    taskId: authTaskId,
    bizType: BIZ_TYPE.ORDER_AUTHORIZE,
    bizId,
    orderId: orderId || '',
    operatorRole: OPERATOR_ROLE.USER,
    liabilityType: 'user',
    preMaskTaskId: preMaskTask.taskId,
    preMaskVersion: preMaskTask.preMaskVersion,
    fromPreMask: true,
    rawAssets,
    maskedAssets: toMaskedAssets(rawAssets),
    maskingConfirmed: false,
    maskingConfirmedAt: null,
    updatedAt: Date.now(),
  }
  persistTask(task)
  return task
}

async function createServiceAuthorizeTaskFromPreMask({ bizId, nodes }) {
  if (useApi()) {
    const preview = await post(`/user/albums/${bizId}/authorize-preview`)
    return fetchTask(preview.taskId)
  }
  await delay(120)
  const preMaskBizType = BIZ_TYPE.SERVICE_PRE_MASK
  const authorizeBizType = BIZ_TYPE.SERVICE_AUTHORIZE
  let preMaskTask = findPreMaskTaskByAlbumId(bizId, preMaskBizType)
  if (
    !preMaskTask ||
    preMaskTask.preMaskStatus === PRE_MASK_STATUS.RUNNING ||
    preMaskTask.preMaskStatus === PRE_MASK_STATUS.IDLE
  ) {
    preMaskTask = await ensureServicePreMaskTask(bizId, nodes || [], { instant: true })
  }
  if (!preMaskTask) {
    const err = new Error('预脱敏尚未就绪，请稍后再试')
    err.code = 409
    throw err
  }

  const existing = findAuthorizeTaskByAlbumId(bizId, authorizeBizType)
  if (
    existing &&
    existing.preMaskTaskId === preMaskTask.taskId &&
    existing.preMaskVersion === preMaskTask.preMaskVersion
  ) {
    return existing
  }
  if (existing) {
    clearPendingAuthorizeTasks(bizId, authorizeBizType)
  }

  const rawAssets = (preMaskTask.rawAssets || []).map((asset) => ({
    ...asset,
    maskedUrl: asset.maskedUrl || asset.preMaskedUrl || '',
    previewed: false,
  }))
  const authTaskId = buildAuthorizeTaskId(bizId)
  const task = {
    taskId: authTaskId,
    bizType: authorizeBizType,
    bizId,
    operatorRole: OPERATOR_ROLE.USER,
    liabilityType: 'user',
    preMaskTaskId: preMaskTask.taskId,
    preMaskVersion: preMaskTask.preMaskVersion,
    fromPreMask: true,
    rawAssets,
    maskedAssets: toMaskedAssets(rawAssets),
    maskingConfirmed: false,
    maskingConfirmedAt: null,
    updatedAt: Date.now(),
  }
  persistTask(task)
  return task
}

function buildMerchantColdStartTaskId(albumId) {
  return `task_mch_${albumId}`
}

async function createMerchantColdStartTaskFromPreMask({ bizId, nodes }) {
  if (useApi()) {
    const data = await post(`/merchant/service-albums/${bizId}/cold-start-preview`)
    return normalizeTaskAssets(data.task || data)
  }
  await delay(120)
  const preMaskBizType = BIZ_TYPE.SERVICE_PRE_MASK
  let preMaskTask = findPreMaskTaskByAlbumId(bizId, preMaskBizType)
  if (
    !preMaskTask ||
    preMaskTask.preMaskStatus === PRE_MASK_STATUS.RUNNING ||
    preMaskTask.preMaskStatus === PRE_MASK_STATUS.IDLE
  ) {
    if (nodes && nodes.length) {
      preMaskTask = await ensureServicePreMaskTask(bizId, nodes, { instant: true })
    }
  }
  if (!preMaskTask) {
    const err = new Error('预脱敏尚未就绪，请稍后再试')
    err.code = 409
    throw err
  }

  const taskId = buildMerchantColdStartTaskId(bizId)
  const existing = loadTasks().find((t) => t.taskId === taskId && !t.maskingConfirmed)
  if (
    existing &&
    existing.preMaskTaskId === preMaskTask.taskId &&
    existing.preMaskVersion === preMaskTask.preMaskVersion
  ) {
    return existing
  }

  const rawAssets = (preMaskTask.rawAssets || []).map((asset) => ({
    ...asset,
    maskedUrl: asset.maskedUrl || asset.preMaskedUrl || '',
    previewed: false,
  }))
  const task = {
    taskId,
    bizType: BIZ_TYPE.MERCHANT_HISTORY,
    bizId,
    operatorRole: OPERATOR_ROLE.MERCHANT,
    liabilityType: 'merchant',
    preMaskTaskId: preMaskTask.taskId,
    preMaskVersion: preMaskTask.preMaskVersion,
    fromPreMask: true,
    rawAssets,
    maskedAssets: toMaskedAssets(rawAssets),
    maskingConfirmed: false,
    maskingConfirmedAt: null,
    updatedAt: Date.now(),
  }
  persistTask(task)
  return task
}

/** 一键 AI 脱敏（mock 批量） */
async function runAutoMask(taskId) {
  if (useApi()) {
    return normalizeTaskAssets(await post(`/desensitize/tasks/${taskId}/auto-mask`))
  }
  await delay(480)
  const task = await fetchTask(taskId)
  if (
    task.bizType === BIZ_TYPE.ORDER_PRE_MASK ||
    task.bizType === BIZ_TYPE.SERVICE_PRE_MASK
  ) {
    const err = new Error('预脱敏任务由系统自动处理，无需手动脱敏')
    err.code = 400
    throw err
  }
  const albumId = task.bizId
  const assets = (task.rawAssets || []).map((asset) => {
    if (
      asset.status === ASSET_STATUS.MASKED_READY ||
      asset.status === ASSET_STATUS.MANUAL_MASKED
    ) {
      return asset
    }
    return {
      ...asset,
      status: ASSET_STATUS.MASKING,
    }
  })
  persistTask({ ...task, rawAssets: assets, updatedAt: Date.now() })

  await delay(400)
  const updated = await fetchTask(taskId)
  const nextAssets = (updated.rawAssets || []).map((asset) => {
    if (!asset.url) {
      return { ...asset, status: ASSET_STATUS.MASK_FAILED }
    }
    const maskedUrl = buildMaskedUrl(asset.url, albumId, asset)
    return {
      ...asset,
      status: ASSET_STATUS.MASKED_READY,
      maskedUrl,
      previewed: asset.previewed || false,
      riskTags: ['plate', 'face'].slice(0, Math.random() > 0.5 ? 1 : 2),
    }
  })
  const maskedAssets = nextAssets
    .filter((a) => a.maskedUrl)
    .map((a) => ({
      id: `m_${a.id}`,
      rawId: a.id,
      url: a.maskedUrl,
      status: a.status,
    }))
  return persistTask({
    ...updated,
    rawAssets: nextAssets,
    maskedAssets,
    updatedAt: Date.now(),
  })
}

async function retryAsset(taskId, assetId) {
  if (useApi()) {
    return normalizeTaskAssets(
      await post(`/desensitize/tasks/${taskId}/assets/${assetId}/retry`)
    )
  }
  await delay(360)
  const task = await fetchTask(taskId)
  const albumId = task.bizId
  const nextAssets = (task.rawAssets || []).map((asset) => {
    if (asset.id !== assetId) return asset
    const maskedUrl = buildMaskedUrl(asset.url, albumId, asset)
    return {
      ...asset,
      status: maskedUrl ? ASSET_STATUS.MASKED_READY : ASSET_STATUS.MASK_FAILED,
      maskedUrl: maskedUrl || '',
    }
  })
  const maskedAssets = nextAssets
    .filter((a) => a.maskedUrl)
    .map((a) => ({
      id: `m_${a.id}`,
      rawId: a.id,
      url: a.maskedUrl,
      status: a.status,
    }))
  return persistTask({
    ...task,
    rawAssets: nextAssets,
    maskedAssets,
    updatedAt: Date.now(),
  })
}

function allPreviewed(assets) {
  const ready = (assets || []).filter((a) => {
    const ok = new Set([
      ASSET_STATUS.MASKED_READY,
      ASSET_STATUS.MANUAL_MASKED,
      ASSET_STATUS.CONFIRMED,
    ])
    return ok.has(a.status) && a.maskedUrl
  })
  if (!ready.length) return false
  return ready.every((a) => a.previewed)
}

async function markAssetPreviewed(taskId, assetId) {
  if (useApi()) {
    return normalizeTaskAssets(
      await post(`/desensitize/tasks/${taskId}/assets/${assetId}/previewed`)
    )
  }
  const task = await fetchTask(taskId)
  const rawAssets = (task.rawAssets || []).map((a) =>
    a.id === assetId ? { ...a, previewed: true } : a
  )
  return persistTask({ ...task, rawAssets, updatedAt: Date.now() })
}

/** PKG-COACH：从公开配图包移除（可删不可加） */
async function excludeAuthorizeAsset(taskId, assetId) {
  if (useApi()) {
    return normalizeTaskAssets(
      await post(`/desensitize/tasks/${taskId}/assets/${assetId}/exclude`)
    )
  }
  const task = await fetchTask(taskId)
  const rawAssets = (task.rawAssets || []).filter((a) => a.id !== assetId)
  return persistTask({ ...task, rawAssets, updatedAt: Date.now() })
}

/** A-MASK-05：手工打码（框选区域 + 马赛克/模糊） */
async function applyManualMask(taskId, assetId, payload = {}) {
  if (useApi()) {
    return normalizeTaskAssets(
      await post(`/desensitize/tasks/${taskId}/assets/${assetId}/manual-mask`, {
        regions: payload.regions || [],
        mode: payload.mode || 'mosaic',
      })
    )
  }
  await delay(360)
  const task = await fetchTask(taskId)
  const albumId = task.bizId
  const regions = payload.regions || []
  if (!regions.length) {
    const err = new Error('请至少框选一处打码区域')
    err.code = 400
    throw err
  }
  const mode = payload.mode === 'blur' ? 'blur' : 'mosaic'
  const nextAssets = (task.rawAssets || []).map((asset) => {
    if (asset.id !== assetId) return asset
    const maskedUrl = buildMaskedUrl(asset.url, albumId, asset)
    return {
      ...asset,
      status: ASSET_STATUS.MANUAL_MASKED,
      maskedUrl,
      previewed: false,
      riskTags: asset.riskTags || [],
    }
  })
  const maskedAssets = nextAssets
    .filter((a) => a.maskedUrl)
    .map((a) => ({
      id: `m_${a.id}`,
      rawId: a.id,
      url: a.maskedUrl,
      status: a.status,
    }))
  return persistTask({
    ...task,
    rawAssets: nextAssets,
    maskedAssets,
    updatedAt: Date.now(),
  })
}

/** 将脱敏结果写回相册节点 */
function applyMaskedToAlbumNodes(album, task) {
  const byKey = {}
  ;(task.rawAssets || []).forEach((a) => {
    if (!a.maskedUrl) return
    const key = `${a.nodeId}`
    if (!byKey[key]) byKey[key] = []
    byKey[key].push({ index: a.index, maskedUrl: a.maskedUrl, rawUrl: a.url })
  })
  const nodes = (album.nodes || []).map((node) => {
    const entries = (byKey[node.id] || []).sort((a, b) => a.index - b.index)
    const images = node.images || []
    const imagesDesensitized = images.map((raw, index) => {
      const hit = entries.find((e) => e.index === index)
      return hit ? hit.maskedUrl : ''
    })
    return {
      ...node,
      images,
      imagesDesensitized,
    }
  })
  return {
    ...album,
    nodes,
    maskingTaskId: task.taskId,
    maskingConfirmed: true,
    maskingConfirmedAt: Date.now(),
  }
}

/**
 * @param {string} taskId
 * @param {{ liabilityAccepted?: boolean }} [opts]
 */
async function confirmTask(taskId, opts = {}) {
  if (useApi()) {
    const data = await post(`/desensitize/tasks/${taskId}/confirm`, {
      liabilityAccepted: Boolean(opts.liabilityAccepted),
    })
    if (data && data.task) {
      return { task: normalizeTaskAssets(data.task) }
    }
    return data
  }
  if (!opts.liabilityAccepted) {
    const err = new Error('请勾选责任确认')
    err.code = 400
    throw err
  }
  await delay(400)
  let task = await fetchTask(taskId)
  if (!allMaskingSucceeded(task.rawAssets)) {
    const err = new Error('仍有图片未完成脱敏')
    err.code = 400
    throw err
  }
  const rawAssets = (task.rawAssets || []).map((a) => ({
    ...a,
    status: ASSET_STATUS.CONFIRMED,
    previewed: true,
  }))
  task = persistTask({
    ...task,
    rawAssets,
    maskingConfirmed: true,
    maskingConfirmedAt: Date.now(),
    updatedAt: Date.now(),
  })

  const albums = loadAlbums()
  const idx = albums.findIndex((a) => a.id === task.bizId)
  if (idx < 0) {
    const err = new Error('关联相册不存在')
    err.code = 404
    throw err
  }
  const updated = applyMaskedToAlbumNodes(albums[idx], task)
  albums[idx] = updated
  saveAlbums(albums)
  return { task, album: updated }
}

async function isAlbumReadyForReview(albumId) {
  await delay(80)
  const album = loadAlbums().find((a) => a.id === albumId)
  return !!(album && album.maskingConfirmed)
}

function getWorkbenchStats(task) {
  const total = (task.rawAssets || []).length
  const processed = countReady(task.rawAssets)
  const failed = (task.rawAssets || []).filter(
    (a) => a.status === ASSET_STATUS.MASK_FAILED
  ).length
  return {
    total,
    processed,
    failed,
    canConfirm: allMaskingSucceeded(task.rawAssets),
    needPreview: !allPreviewed(task.rawAssets),
  }
}

module.exports = {
  createTask,
  ensureOrderPreMaskTask,
  ensureServicePreMaskTask,
  createOrderAuthorizeTaskFromPreMask,
  createServiceAuthorizeTaskFromPreMask,
  createMerchantColdStartTaskFromPreMask,
  confirmOrderAuthorizeTask,
  fetchTask,
  findPreMaskTaskByAlbumId,
  shouldRunOrderPreMask,
  shouldRunServicePreMask,
  runAutoMask,
  retryAsset,
  applyManualMask,
  confirmTask,
  markAssetPreviewed,
  excludeAuthorizeAsset,
  allPreviewed,
  isAlbumReadyForReview,
  getWorkbenchStats,
  collectRawAssetsFromNodes,
  BIZ_TYPE,
  ASSET_STATUS,
  PRE_MASK_STATUS,
}
