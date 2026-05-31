const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const {
  BIZ_TYPE,
  PRE_MASK_STATUS,
  ASSET_STATUS,
  nodesFingerprint,
  collectAssetsFromAlbum,
  resolvePreMaskStatus,
  mapTaskRecord,
  buildPreMaskTaskId,
  buildAuthorizeTaskId,
  albumToNodeView,
} = require('./desensitize.constants')
const { resolveDesensitizedUrlForAsset, ensureMediaRecordFromUrl } = require('./media.service')
const { isStubCopyArtifact } = require('../lib/media-file-compare')
const { parseObjectKeyFromPublicUrl } = require('../lib/media-storage')
const { listPrivacyDetectionsByImageId } = require('./privacy-detection.service')
const { ROLES } = require('../lib/jwt')

async function loadAlbumWithRelations(albumId) {
  return prisma.album.findUnique({
    where: { id: albumId },
    include: {
      order: true,
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
    },
  })
}

function canIncludePrivacyDetections(options = {}) {
  if (options.includeDetections === true) return true
  const roles = options.roles || []
  return roles.includes(ROLES.SYSTEM)
}

async function enrichTaskWithPrivacyDetections(mapped, options = {}) {
  if (!mapped || !canIncludePrivacyDetections(options)) return mapped
  const rawAssets = await Promise.all(
    (mapped.rawAssets || []).map(async (asset) => {
      if (!asset.mediaId) return asset
      const privacyDetections = await listPrivacyDetectionsByImageId(asset.mediaId, {
        caseId: options.caseId,
        includeResultJson: true,
      })
      return { ...asset, privacyDetections }
    })
  )
  return { ...mapped, rawAssets }
}

async function getTaskById(taskId, options = {}) {
  const task = await prisma.desensitizeTask.findUnique({
    where: { taskId },
    include: { assets: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] } },
  })
  const mapped = mapTaskRecord(task)
  return enrichTaskWithPrivacyDetections(mapped, options)
}

function resolveAlbumBizTypes(album) {
  if (album && album.orderId) {
    return {
      preMaskBizType: BIZ_TYPE.ORDER_PRE_MASK,
      authorizeBizType: BIZ_TYPE.ORDER_AUTHORIZE,
    }
  }
  return {
    preMaskBizType: BIZ_TYPE.SERVICE_PRE_MASK,
    authorizeBizType: BIZ_TYPE.SERVICE_AUTHORIZE,
  }
}

async function findPreMaskTask(albumId, preMaskBizType) {
  let bizType = preMaskBizType
  if (!bizType) {
    const album = await prisma.album.findUnique({
      where: { id: albumId },
      select: { orderId: true },
    })
    bizType = album?.orderId
      ? BIZ_TYPE.ORDER_PRE_MASK
      : BIZ_TYPE.SERVICE_PRE_MASK
  }
  const task = await prisma.desensitizeTask.findFirst({
    where: {
      bizId: albumId,
      bizType,
    },
    include: { assets: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] } },
    orderBy: { updatedAt: 'desc' },
  })
  return task
}

async function clearPendingAuthorizeTasks(albumId, authorizeBizType) {
  const bizTypes = authorizeBizType
    ? [authorizeBizType]
    : [BIZ_TYPE.ORDER_AUTHORIZE, BIZ_TYPE.SERVICE_AUTHORIZE]
  await prisma.desensitizeTask.deleteMany({
    where: {
      bizId: albumId,
      bizType: { in: bizTypes },
      maskingConfirmed: false,
    },
  })
}

async function preMaskTaskHasStubArtifacts(preMaskTask) {
  if (!preMaskTask?.assets?.length) return false
  for (const asset of preMaskTask.assets) {
    const rawUrl = asset.rawUrl
    if (!rawUrl) continue
    const rawKey = parseObjectKeyFromPublicUrl(rawUrl)
    const maskedUrl = asset.maskedUrl || asset.preMaskedUrl
    const maskedKey = maskedUrl ? parseObjectKeyFromPublicUrl(maskedUrl) : ''
    if (rawKey && maskedKey && isStubCopyArtifact(rawKey, maskedKey)) {
      console.info('[desensitize] stub copy in pre-mask task asset', { rawKey, maskedKey })
      return true
    }
    const media = await ensureMediaRecordFromUrl(rawUrl)
    if (
      media?.desensitizedKey &&
      media.desensitizeStatus === 'success' &&
      isStubCopyArtifact(media.objectKey, media.desensitizedKey)
    ) {
      console.info('[desensitize] stub copy in media_assets', { objectKey: media.objectKey })
      return true
    }
  }
  return false
}

async function ensureOrderPreMaskTask(albumId, options = {}) {
  const album = await loadAlbumWithRelations(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.code = 100004
    err.status = 404
    throw err
  }
  const { preMaskBizType, authorizeBizType } = {
    ...resolveAlbumBizTypes(album),
    ...options,
  }
  const nodeViews = albumToNodeView(album)
  const fingerprint = nodesFingerprint(nodeViews)
  const versionedFingerprint = `${fingerprint}@${config.desensitize.cacheVersion}`
  const existing = await findPreMaskTask(albumId, preMaskBizType)
  let force = Boolean(options.force)
  if (
    existing &&
    existing.fingerprint === versionedFingerprint &&
    [PRE_MASK_STATUS.READY, PRE_MASK_STATUS.PARTIAL_FAILED].includes(existing.preMaskStatus) &&
    !force
  ) {
    const hasStub = await preMaskTaskHasStubArtifacts(existing)
    if (!hasStub) return mapTaskRecord(existing)
    console.info('[desensitize] force pre-mask rerun: stub copy artifacts', { albumId })
    force = true
  }

  if (existing && existing.fingerprint !== versionedFingerprint) {
    await clearPendingAuthorizeTasks(albumId, authorizeBizType)
    force = true
  }

  const taskId = buildPreMaskTaskId(albumId)
  const preMaskVersion = (existing?.preMaskVersion || 0) + 1
  const assetInputs = await Promise.all(
    collectAssetsFromAlbum({ nodes: nodeViews }).map(async (asset) => {
      const masked = await resolveDesensitizedUrlForAsset(asset.rawUrl, {
        albumId,
        nodeId: asset.nodeId,
        idx: asset.idx,
        force,
      })
      const preMaskedUrl = masked.ok ? masked.maskedUrl : ''
      return {
        assetId: asset.assetId,
        mediaId: masked.mediaId || '',
        nodeId: asset.nodeId,
        nodeTitle: asset.nodeTitle,
        idx: asset.idx,
        rawUrl: asset.rawUrl,
        maskedUrl: preMaskedUrl,
        preMaskedUrl,
        status: preMaskedUrl ? ASSET_STATUS.MASKED_READY : ASSET_STATUS.MASK_FAILED,
        previewed: false,
        riskTags: masked.riskTags && masked.riskTags.length ? masked.riskTags : preMaskedUrl ? [] : [],
        riskLevel: masked.riskLevel || (preMaskedUrl ? 'low' : ''),
      }
    })
  )
  const preMaskStatus = resolvePreMaskStatus(assetInputs)
  const now = new Date()

  await prisma.desensitizeTask.upsert({
    where: { taskId },
    create: {
      taskId,
      bizType: preMaskBizType,
      bizId: albumId,
      orderId: album.orderId,
      operatorRole: 'system',
      liabilityType: 'platform',
      fingerprint: versionedFingerprint,
      preMaskStatus,
      preMaskVersion,
      preMaskedAt: now,
      assets: { create: assetInputs },
    },
    update: {
      fingerprint: versionedFingerprint,
      preMaskStatus,
      preMaskVersion,
      preMaskedAt: now,
      maskingConfirmed: false,
      maskingConfirmedAt: null,
      assets: {
        deleteMany: {},
        create: assetInputs,
      },
    },
  })

  await prisma.album.update({
    where: { id: albumId },
    data: { fingerprint },
  })

  return getTaskById(taskId)
}

async function createAlbumAuthorizeTaskFromPreMask(albumId) {
  const album = await loadAlbumWithRelations(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.code = 100004
    err.status = 404
    throw err
  }

  const { preMaskBizType, authorizeBizType } = resolveAlbumBizTypes(album)
  const nodeViews = albumToNodeView(album)
  const versionedFingerprint = `${nodesFingerprint(nodeViews)}@${config.desensitize.cacheVersion}`
  let preMaskTask = await findPreMaskTask(albumId, preMaskBizType)
  const stubArtifacts = preMaskTask ? await preMaskTaskHasStubArtifacts(preMaskTask) : false
  const engineStale = Boolean(preMaskTask && preMaskTask.fingerprint !== versionedFingerprint)
  const needsPreMaskRefresh =
    !preMaskTask ||
    engineStale ||
    [
      PRE_MASK_STATUS.RUNNING,
      PRE_MASK_STATUS.IDLE,
      PRE_MASK_STATUS.FAILED,
      null,
    ].includes(preMaskTask.preMaskStatus) ||
    stubArtifacts

  if (needsPreMaskRefresh) {
    await ensureOrderPreMaskTask(albumId, {
      force:
        preMaskTask?.preMaskStatus === PRE_MASK_STATUS.FAILED || stubArtifacts || engineStale,
      preMaskBizType,
      authorizeBizType,
    })
    preMaskTask = await findPreMaskTask(albumId, preMaskBizType)
  }

  if (!preMaskTask) {
    const err = new Error('预脱敏尚未就绪，请稍后再试')
    err.code = 100007
    err.status = 409
    throw err
  }

  const readyAssets = (preMaskTask.assets || []).filter((a) => a.maskedUrl || a.preMaskedUrl)
  if (preMaskTask.preMaskStatus === PRE_MASK_STATUS.FAILED || !readyAssets.length) {
    const failedAssets = (preMaskTask.assets || []).filter(
      (a) => a.status === ASSET_STATUS.MASK_FAILED
    )
    console.warn('[desensitize] pre-mask not ready', {
      albumId,
      preMaskStatus: preMaskTask.preMaskStatus,
      total: (preMaskTask.assets || []).length,
      failed: failedAssets.length,
    })
    const err = new Error('预脱敏失败，请稍后重试或联系客服')
    err.code = 100007
    err.status = 409
    throw err
  }

  const existingAuth = await prisma.desensitizeTask.findFirst({
    where: {
      bizId: album.id,
      bizType: authorizeBizType,
      maskingConfirmed: false,
      preMaskTaskId: preMaskTask.taskId,
      preMaskVersion: preMaskTask.preMaskVersion,
    },
    include: { assets: true },
  })
  if (existingAuth) {
    return {
      preview: buildAuthorizePreviewPayload(album, existingAuth),
      task: mapTaskRecord(existingAuth),
    }
  }

  await clearPendingAuthorizeTasks(album.id, authorizeBizType)
  const authTaskId = buildAuthorizeTaskId(album.id)
  const assetInputs = (preMaskTask.assets || []).map((asset) => ({
    assetId: asset.assetId,
    mediaId: asset.mediaId || '',
    nodeId: asset.nodeId,
    nodeTitle: asset.nodeTitle,
    idx: asset.idx,
    rawUrl: asset.rawUrl,
    maskedUrl: asset.maskedUrl || asset.preMaskedUrl || '',
    preMaskedUrl: asset.preMaskedUrl || asset.maskedUrl || '',
    status: asset.status,
    previewed: false,
    riskTags: asset.riskTags || [],
    riskLevel: asset.riskLevel || '',
  }))

  await prisma.desensitizeTask.create({
    data: {
      taskId: authTaskId,
      bizType: authorizeBizType,
      bizId: album.id,
      orderId: album.orderId || null,
      operatorRole: 'user',
      liabilityType: 'user',
      preMaskTaskId: preMaskTask.taskId,
      preMaskVersion: preMaskTask.preMaskVersion,
      fromPreMask: true,
      assets: { create: assetInputs },
    },
  })

  const task = await getTaskById(authTaskId)
  return {
    preview: buildAuthorizePreviewPayload(album, { taskId: authTaskId, ...task }),
    task,
  }
}

async function createOrderAuthorizeTaskFromPreMask(orderId) {
  const album = await prisma.album.findFirst({
    where: { orderId },
    select: { id: true },
  })
  if (!album) {
    const err = new Error('该订单暂无服务相册')
    err.code = 100004
    err.status = 404
    throw err
  }
  return createAlbumAuthorizeTaskFromPreMask(album.id)
}

function buildAuthorizePreviewPayload(album, task) {
  return {
    taskId: task.taskId,
    albumId: album.id,
    orderId: album.orderId,
    fromPreMask: Boolean(task.fromPreMask ?? true),
    preMaskTaskId: task.preMaskTaskId || '',
    preMaskVersion: task.preMaskVersion || 0,
  }
}

async function runAutoMask(taskId, options = {}) {
  const task = await prisma.desensitizeTask.findUnique({
    where: { taskId },
    include: { assets: true },
  })
  if (!task) {
    const err = new Error('脱敏任务不存在')
    err.status = 404
    throw err
  }
  if (
    task.bizType === BIZ_TYPE.ORDER_PRE_MASK ||
    task.bizType === BIZ_TYPE.SERVICE_PRE_MASK
  ) {
    const err = new Error('预脱敏任务由系统自动处理，无需手动脱敏')
    err.status = 400
    throw err
  }
  const updates = await Promise.all(
    (task.assets || []).map(async (asset) => {
      const masked = await resolveDesensitizedUrlForAsset(asset.rawUrl, {
        albumId: task.bizId,
        nodeId: asset.nodeId,
        idx: asset.idx,
      })
      const maskedUrl = masked.ok ? masked.maskedUrl : ''
      return prisma.desensitizeAsset.update({
        where: { taskId_assetId: { taskId, assetId: asset.assetId } },
        data: {
          mediaId: masked.mediaId || asset.mediaId || '',
          maskedUrl,
          preMaskedUrl: maskedUrl,
          status: maskedUrl ? ASSET_STATUS.MASKED_READY : ASSET_STATUS.MASK_FAILED,
          riskTags: masked.riskTags && masked.riskTags.length ? masked.riskTags : maskedUrl ? [] : [],
          riskLevel: masked.riskLevel || (maskedUrl ? 'low' : ''),
        },
      })
    })
  )
  await Promise.all(updates)
  return getTaskById(taskId, options)
}

async function retryAsset(taskId, assetId, options = {}) {
  const asset = await prisma.desensitizeAsset.findUnique({
    where: { taskId_assetId: { taskId, assetId } },
    include: { task: true },
  })
  if (!asset) {
    const err = new Error('图片资源不存在')
    err.status = 404
    throw err
  }
  const masked = await resolveDesensitizedUrlForAsset(asset.rawUrl, {
    albumId: asset.task.bizId,
    nodeId: asset.nodeId,
    idx: asset.idx,
  })
  const maskedUrl = masked.ok ? masked.maskedUrl : ''
  await prisma.desensitizeAsset.update({
    where: { taskId_assetId: { taskId, assetId } },
    data: {
      mediaId: masked.mediaId || asset.mediaId || '',
      maskedUrl,
      preMaskedUrl: maskedUrl,
      status: maskedUrl ? ASSET_STATUS.MASKED_READY : ASSET_STATUS.MASK_FAILED,
      riskTags: masked.riskTags && masked.riskTags.length ? masked.riskTags : maskedUrl ? [] : [],
      riskLevel: masked.riskLevel || (maskedUrl ? 'low' : ''),
    },
  })
  return getTaskById(taskId, options)
}

async function markAssetPreviewed(taskId, assetId, options = {}) {
  await prisma.desensitizeAsset.updateMany({
    where: { taskId, assetId },
    data: { previewed: true },
  })
  return getTaskById(taskId, options)
}

function allMaskingSucceeded(rawAssets) {
  const ok = new Set([
    ASSET_STATUS.MASKED_READY,
    ASSET_STATUS.MANUAL_MASKED,
    ASSET_STATUS.CONFIRMED,
  ])
  return (rawAssets || []).length > 0 && rawAssets.every((a) => ok.has(a.status))
}

async function confirmOrderAuthorizeTask(taskId, opts = {}) {
  if (!opts.liabilityAccepted) {
    const err = new Error('请勾选责任确认')
    err.status = 400
    throw err
  }
  const task = await getTaskById(taskId)
  const authTypes = [BIZ_TYPE.ORDER_AUTHORIZE, BIZ_TYPE.SERVICE_AUTHORIZE]
  if (!task || !authTypes.includes(task.bizType)) {
    const err = new Error('任务类型不匹配')
    err.status = 400
    throw err
  }
  if (!allMaskingSucceeded(task.rawAssets)) {
    const err = new Error('仍有图片未完成脱敏')
    err.status = 400
    throw err
  }
  await prisma.desensitizeAsset.updateMany({
    where: { taskId },
    data: { status: ASSET_STATUS.CONFIRMED, previewed: true },
  })
  await prisma.desensitizeTask.update({
    where: { taskId },
    data: {
      maskingConfirmed: true,
      maskingConfirmedAt: new Date(),
    },
  })
  return getTaskById(taskId)
}

module.exports = {
  loadAlbumWithRelations,
  albumToNodeView,
  getTaskById,
  canIncludePrivacyDetections,
  ensureOrderPreMaskTask,
  createAlbumAuthorizeTaskFromPreMask,
  createOrderAuthorizeTaskFromPreMask,
  runAutoMask,
  retryAsset,
  markAssetPreviewed,
  confirmOrderAuthorizeTask,
}
