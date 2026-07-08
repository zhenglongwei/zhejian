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
  buildMerchantColdStartTaskId,
  buildReviewPreviewTaskId,
  albumToNodeView,
} = require('./desensitize.constants')
const { resolveDesensitizedUrlForAsset, ensureMediaRecordFromUrl, applyManualMaskToAsset } = require('./media.service')
const { isStubCopyArtifact } = require('../lib/media-file-compare')
const { parseObjectKeyFromPublicUrl } = require('../lib/media-storage')
const { listPrivacyDetectionsByImageId } = require('./privacy-detection.service')
const { ROLES } = require('../lib/jwt')
const { ALBUM_REVIEW_STATUS } = require('../constants/album-review')
const {
  ensureReviewImagesMasked,
  parseRawReviewImages,
} = require('./album-review-image.service')

function buildReviewAssetInputsFromRow(row) {
  const rawUrls = parseRawReviewImages(row?.imagesJson)
  if (!rawUrls.length) return []
  const maskedSlots = Array.isArray(row?.imagesMaskedJson) ? row.imagesMaskedJson : []
  return rawUrls.map((rawUrl, idx) => {
    const maskedUrl = String(maskedSlots[idx] || '').trim()
    return {
      assetId: `review_${idx}`,
      mediaId: '',
      nodeId: 'review',
      nodeTitle: '评价配图',
      idx,
      rawUrl,
      maskedUrl,
      preMaskedUrl: maskedUrl,
      status: maskedUrl ? ASSET_STATUS.MASKED_READY : ASSET_STATUS.MASK_FAILED,
      previewed: false,
      riskTags: [],
      riskLevel: maskedUrl ? 'low' : '',
    }
  })
}

async function buildReviewAuthorizeAssetInputs(albumId) {
  const review = await prisma.serviceAlbumReview.findFirst({
    where: {
      albumId,
      status: { in: [ALBUM_REVIEW_STATUS.SUBMITTED, ALBUM_REVIEW_STATUS.REPLIED] },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!review) return []

  const row = await ensureReviewImagesMasked(review)
  return buildReviewAssetInputsFromRow(row)
}

async function shouldIncludeReviewInAuthorizePreview(albumId) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { publicCaseStatus: true },
  })
  const status = album?.publicCaseStatus || 'private'
  return ['private', 'user_rejected'].includes(status)
}

function mapPreMaskAssetToAuthorizeInput(asset) {
  return {
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
  }
}

async function buildAuthorizeAssetInputs(albumId, preMaskTask) {
  const includeReview = await shouldIncludeReviewInAuthorizePreview(albumId)
  const reviewAssets = includeReview ? await buildReviewAuthorizeAssetInputs(albumId) : []
  const albumAssets = (preMaskTask.assets || []).map(mapPreMaskAssetToAuthorizeInput)
  return [...albumAssets, ...reviewAssets]
}

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

function notifyPreMaskReadyForGeoLlm(albumId, preMaskStatus) {
  if (![PRE_MASK_STATUS.READY, PRE_MASK_STATUS.PARTIAL_FAILED].includes(preMaskStatus)) return
  const { scheduleCaseGeoLlmForAlbum } = require('./case-geo-llm.service')
  scheduleCaseGeoLlmForAlbum(albumId, { trigger: 'pre_mask_ready' })
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

  notifyPreMaskReadyForGeoLlm(albumId, preMaskStatus)

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
  const preMaskAssetCount = (preMaskTask?.assets || []).length
  const preMaskFailedNeedsRetry =
    preMaskTask?.preMaskStatus === PRE_MASK_STATUS.FAILED && preMaskAssetCount > 0
  const needsPreMaskRefresh =
    !preMaskTask ||
    engineStale ||
    [PRE_MASK_STATUS.RUNNING, PRE_MASK_STATUS.IDLE, null].includes(
      preMaskTask?.preMaskStatus
    ) ||
    preMaskFailedNeedsRetry ||
    stubArtifacts

  if (needsPreMaskRefresh) {
    await ensureOrderPreMaskTask(albumId, {
      force:
        preMaskFailedNeedsRetry || stubArtifacts || engineStale,
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

  if (preMaskTask.preMaskStatus === PRE_MASK_STATUS.FAILED) {
    const failedAssets = (preMaskTask.assets || []).filter(
      (a) => a.status === ASSET_STATUS.MASK_FAILED
    )
    console.warn('[desensitize] pre-mask all failed, open authorize workbench', {
      albumId,
      preMaskStatus: preMaskTask.preMaskStatus,
      total: (preMaskTask.assets || []).length,
      failed: failedAssets.length,
    })
  }

  const authTaskId = buildAuthorizeTaskId(album.id)
  const existingAuth = await prisma.desensitizeTask.findUnique({
    where: { taskId: authTaskId },
    include: { assets: true },
  })

  const preMaskMatches = (task) =>
    task &&
    task.preMaskTaskId === preMaskTask.taskId &&
    task.preMaskVersion === preMaskTask.preMaskVersion

  if (existingAuth && existingAuth.bizType === authorizeBizType && preMaskMatches(existingAuth)) {
    if (!existingAuth.maskingConfirmed) {
      const assetInputs = await buildAuthorizeAssetInputs(album.id, preMaskTask)
      await prisma.desensitizeTask.update({
        where: { taskId: authTaskId },
        data: {
          assets: {
            deleteMany: {},
            create: assetInputs,
          },
        },
      })
      const task = await getTaskById(authTaskId)
      return {
        preview: buildAuthorizePreviewPayload(album, task, preMaskTask),
        task,
      }
    }
    if (['pending_review', 'public_approved'].includes(album.publicCaseStatus)) {
      return {
        preview: buildAuthorizePreviewPayload(album, existingAuth, preMaskTask),
        task: mapTaskRecord(existingAuth),
      }
    }
  }

  await clearPendingAuthorizeTasks(album.id, authorizeBizType)
  const assetInputs = await buildAuthorizeAssetInputs(album.id, preMaskTask)

  await prisma.desensitizeTask.upsert({
    where: { taskId: authTaskId },
    create: {
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
    update: {
      bizType: authorizeBizType,
      bizId: album.id,
      orderId: album.orderId || null,
      operatorRole: 'user',
      liabilityType: 'user',
      preMaskTaskId: preMaskTask.taskId,
      preMaskVersion: preMaskTask.preMaskVersion,
      fromPreMask: true,
      maskingConfirmed: false,
      maskingConfirmedAt: null,
      assets: {
        deleteMany: {},
        create: assetInputs,
      },
    },
  })

  const task = await getTaskById(authTaskId)
  return {
    preview: buildAuthorizePreviewPayload(album, { taskId: authTaskId, ...task }, preMaskTask),
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

function preMaskHasReadyAssets(preMaskTask) {
  return (preMaskTask?.assets || []).some((a) => a.maskedUrl || a.preMaskedUrl)
}

function buildAuthorizePreviewPayload(album, task, preMaskTask) {
  const preMaskReady = preMaskTask ? preMaskHasReadyAssets(preMaskTask) : true
  return {
    taskId: task.taskId,
    albumId: album.id,
    orderId: album.orderId,
    fromPreMask: Boolean((task.fromPreMask ?? true) && preMaskReady),
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

async function refreshPreMaskStatusForTask(taskId) {
  const task = await prisma.desensitizeTask.findUnique({
    where: { taskId },
    include: { assets: true },
  })
  if (!task) return
  const isPreMask =
    task.bizType === BIZ_TYPE.SERVICE_PRE_MASK || task.bizType === BIZ_TYPE.ORDER_PRE_MASK
  if (!isPreMask) return
  const previousStatus = task.preMaskStatus
  const preMaskStatus = resolvePreMaskStatus(task.assets || [])
  if (preMaskStatus === previousStatus) return
  await prisma.desensitizeTask.update({
    where: { taskId },
    data: { preMaskStatus },
  })
  notifyPreMaskReadyForGeoLlm(task.bizId, preMaskStatus)
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
    force: Boolean(options.force),
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
  await refreshPreMaskStatusForTask(taskId)
  return getTaskById(taskId, options)
}

const MANUAL_MASK_ALLOWED = new Set([
  ASSET_STATUS.RAW_UPLOADED,
  ASSET_STATUS.MASK_FAILED,
  ASSET_STATUS.MASKED_READY,
  ASSET_STATUS.MANUAL_MASKED,
])

async function applyManualMask(taskId, assetId, payload = {}, options = {}) {
  const { regions, mode = 'mosaic' } = payload || {}
  const asset = await prisma.desensitizeAsset.findUnique({
    where: { taskId_assetId: { taskId, assetId } },
    include: { task: true },
  })
  if (!asset) {
    const err = new Error('图片资源不存在')
    err.status = 404
    throw err
  }
  const task = asset.task
  if (!task) {
    const err = new Error('脱敏任务不存在')
    err.status = 404
    throw err
  }
  if (task.maskingConfirmed) {
    const err = new Error('脱敏已确认，无法修改')
    err.status = 409
    throw err
  }
  if (
    task.bizType === BIZ_TYPE.ORDER_PRE_MASK ||
    task.bizType === BIZ_TYPE.SERVICE_PRE_MASK
  ) {
    const err = new Error('预脱敏任务不支持手工打码')
    err.status = 400
    throw err
  }
  if (!MANUAL_MASK_ALLOWED.has(asset.status)) {
    const err = new Error('当前状态不支持手工打码')
    err.status = 409
    throw err
  }

  const result = await applyManualMaskToAsset({
    rawUrl: asset.rawUrl,
    maskedUrl: asset.maskedUrl || asset.preMaskedUrl,
    mediaId: asset.mediaId,
    albumId: task.bizId,
    nodeId: asset.nodeId,
    idx: asset.idx,
    regions,
    mode,
  })

  if (!result.maskedUrl) {
    const err = new Error('手工打码未生成有效脱敏图')
    err.status = 422
    throw err
  }

  await prisma.desensitizeAsset.update({
    where: { taskId_assetId: { taskId, assetId } },
    data: {
      mediaId: result.mediaId || asset.mediaId || '',
      maskedUrl: result.maskedUrl,
      preMaskedUrl: result.maskedUrl,
      status: ASSET_STATUS.MANUAL_MASKED,
      previewed: false,
    },
  })
  await refreshPreMaskStatusForTask(taskId)
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
  const assets = rawAssets || []
  if (!assets.length) return true
  const ok = new Set([
    ASSET_STATUS.MASKED_READY,
    ASSET_STATUS.MANUAL_MASKED,
    ASSET_STATUS.CONFIRMED,
    ASSET_STATUS.MASK_FAILED,
  ])
  return assets.every((a) => ok.has(a.status))
}

async function confirmOrderAuthorizeTask(taskId, opts = {}) {
  if (!opts.liabilityAccepted) {
    const err = new Error('请勾选责任确认')
    err.status = 400
    throw err
  }
  const task = await getTaskById(taskId)
  const authTypes = [
    BIZ_TYPE.ORDER_AUTHORIZE,
    BIZ_TYPE.SERVICE_AUTHORIZE,
    BIZ_TYPE.MERCHANT_HISTORY,
  ]
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
  if (task.bizType === BIZ_TYPE.SERVICE_AUTHORIZE || task.bizType === BIZ_TYPE.ORDER_AUTHORIZE) {
    await markAlbumReviewImagesPreviewConfirmed(task.bizId)
  }
  return getTaskById(taskId)
}

async function markAlbumReviewImagesPreviewConfirmed(albumId) {
  const review = await prisma.serviceAlbumReview.findFirst({
    where: {
      albumId,
      status: { in: [ALBUM_REVIEW_STATUS.SUBMITTED, ALBUM_REVIEW_STATUS.REPLIED] },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!review) return
  const rawUrls = parseRawReviewImages(review.imagesJson)
  if (!rawUrls.length) return
  await prisma.serviceAlbumReview.update({
    where: { id: review.id },
    data: { imagesPreviewConfirmed: true },
  })
}

async function createReviewImagePreviewTask(reviewId, userId) {
  const review = await prisma.serviceAlbumReview.findUnique({ where: { id: reviewId } })
  if (!review) {
    const err = new Error('评价不存在')
    err.status = 404
    throw err
  }
  if (review.userId !== userId) {
    const err = new Error('无权查看该评价')
    err.status = 403
    throw err
  }

  const album = await prisma.album.findUnique({
    where: { id: review.albumId },
    select: { publicCaseStatus: true },
  })
  const publicCaseStatus = album?.publicCaseStatus || 'private'
  if (!['pending_review', 'public_approved'].includes(publicCaseStatus)) {
    const err = new Error('当前无需核对评价配图')
    err.status = 409
    throw err
  }

  const rawUrls = parseRawReviewImages(review.imagesJson)
  if (!rawUrls.length) {
    const err = new Error('该评价无配图')
    err.status = 409
    throw err
  }

  const row = await ensureReviewImagesMasked(review)
  const assetInputs = buildReviewAssetInputsFromRow(row)
  if (!assetInputs.length) {
    const err = new Error('评价配图尚未就绪')
    err.status = 409
    throw err
  }

  const taskId = buildReviewPreviewTaskId(reviewId)
  await prisma.desensitizeTask.upsert({
    where: { taskId },
    create: {
      taskId,
      bizType: BIZ_TYPE.SERVICE_REVIEW_PREVIEW,
      bizId: reviewId,
      orderId: null,
      operatorRole: 'user',
      liabilityType: 'user',
      fromPreMask: true,
      assets: { create: assetInputs },
    },
    update: {
      bizType: BIZ_TYPE.SERVICE_REVIEW_PREVIEW,
      bizId: reviewId,
      operatorRole: 'user',
      liabilityType: 'user',
      fromPreMask: true,
      maskingConfirmed: false,
      maskingConfirmedAt: null,
      assets: {
        deleteMany: {},
        create: assetInputs,
      },
    },
  })

  return {
    taskId,
    albumId: review.albumId,
    reviewId,
    fromPreMask: true,
  }
}

async function confirmReviewImagePreviewTask(taskId, opts = {}) {
  if (!opts.liabilityAccepted) {
    const err = new Error('请勾选责任确认')
    err.status = 400
    throw err
  }
  const task = await getTaskById(taskId)
  if (!task || task.bizType !== BIZ_TYPE.SERVICE_REVIEW_PREVIEW) {
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
  await prisma.serviceAlbumReview.update({
    where: { id: task.bizId },
    data: { imagesPreviewConfirmed: true },
  })
  return getTaskById(taskId)
}

async function clearPendingMerchantHistoryTasks(albumId) {
  await prisma.desensitizeTask.deleteMany({
    where: {
      bizId: albumId,
      bizType: BIZ_TYPE.MERCHANT_HISTORY,
      maskingConfirmed: false,
    },
  })
}

async function createMerchantColdStartAuthorizeTaskFromPreMask(albumId) {
  const err = new Error('未关联车主的相册不再支持商家单方提交公开，请由车主扫码关联后授权公示')
  err.code = 100008
  err.status = 409
  throw err

  const album = await loadAlbumWithRelations(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.code = 100004
    err.status = 404
    throw err
  }

  const hasOwner =
    Boolean(String(album.userId || '').trim()) ||
    Boolean(String(album.userPhone || '').trim())
  if (hasOwner) {
    const err = new Error('已关联车主，请由车主完成授权公示')
    err.code = 100008
    err.status = 409
    throw err
  }

  if (album.status !== 'completed' && album.status !== 'published') {
    const err = new Error('请先标记服务相册已完工')
    err.code = 100008
    err.status = 409
    throw err
  }

  const preMaskBizType = BIZ_TYPE.SERVICE_PRE_MASK
  const nodeViews = albumToNodeView(album)
  const versionedFingerprint = `${nodesFingerprint(nodeViews)}@${config.desensitize.cacheVersion}`
  let preMaskTask = await findPreMaskTask(albumId, preMaskBizType)
  const stubArtifacts = preMaskTask ? await preMaskTaskHasStubArtifacts(preMaskTask) : false
  const engineStale = Boolean(preMaskTask && preMaskTask.fingerprint !== versionedFingerprint)
  const preMaskAssetCount = (preMaskTask?.assets || []).length
  const preMaskFailedNeedsRetry =
    preMaskTask?.preMaskStatus === PRE_MASK_STATUS.FAILED && preMaskAssetCount > 0
  const needsPreMaskRefresh =
    !preMaskTask ||
    engineStale ||
    [PRE_MASK_STATUS.RUNNING, PRE_MASK_STATUS.IDLE, null].includes(
      preMaskTask?.preMaskStatus
    ) ||
    preMaskFailedNeedsRetry ||
    stubArtifacts

  if (needsPreMaskRefresh) {
    await ensureOrderPreMaskTask(albumId, {
      force:
        preMaskFailedNeedsRetry || stubArtifacts || engineStale,
      preMaskBizType,
      authorizeBizType: BIZ_TYPE.SERVICE_AUTHORIZE,
    })
    preMaskTask = await findPreMaskTask(albumId, preMaskBizType)
  }

  if (!preMaskTask) {
    const err = new Error('预脱敏尚未就绪，请稍后再试')
    err.code = 100007
    err.status = 409
    throw err
  }

  if (preMaskTask.preMaskStatus === PRE_MASK_STATUS.FAILED) {
    console.warn('[desensitize] pre-mask all failed, open merchant authorize workbench', {
      albumId,
      total: (preMaskTask.assets || []).length,
    })
  }

  const taskId = buildMerchantColdStartTaskId(albumId)
  const existing = await prisma.desensitizeTask.findFirst({
    where: {
      taskId,
      preMaskTaskId: preMaskTask.taskId,
      preMaskVersion: preMaskTask.preMaskVersion,
      maskingConfirmed: false,
    },
    include: { assets: true },
  })
  if (existing) {
    const preMaskReady = preMaskHasReadyAssets(preMaskTask)
    return {
      preview: {
        taskId: existing.taskId,
        albumId: album.id,
        fromPreMask: preMaskReady,
        preMaskTaskId: preMaskTask.taskId,
        preMaskVersion: preMaskTask.preMaskVersion,
      },
      task: mapTaskRecord(existing),
    }
  }

  await clearPendingMerchantHistoryTasks(albumId)
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

  await prisma.desensitizeTask.upsert({
    where: { taskId },
    create: {
      taskId,
      bizType: BIZ_TYPE.MERCHANT_HISTORY,
      bizId: album.id,
      orderId: null,
      operatorRole: 'merchant',
      liabilityType: 'merchant',
      preMaskTaskId: preMaskTask.taskId,
      preMaskVersion: preMaskTask.preMaskVersion,
      fromPreMask: true,
      assets: { create: assetInputs },
    },
    update: {
      preMaskTaskId: preMaskTask.taskId,
      preMaskVersion: preMaskTask.preMaskVersion,
      fromPreMask: true,
      maskingConfirmed: false,
      maskingConfirmedAt: null,
      assets: {
        deleteMany: {},
        create: assetInputs,
      },
    },
  })

  const task = await getTaskById(taskId)
  const preMaskReady = preMaskHasReadyAssets(preMaskTask)
  return {
    preview: {
      taskId,
      albumId: album.id,
      fromPreMask: preMaskReady,
      preMaskTaskId: preMaskTask.taskId,
      preMaskVersion: preMaskTask.preMaskVersion,
    },
    task,
  }
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
  applyManualMask,
  markAssetPreviewed,
  confirmOrderAuthorizeTask,
  confirmReviewImagePreviewTask,
  createReviewImagePreviewTask,
  createMerchantColdStartAuthorizeTaskFromPreMask,
}
