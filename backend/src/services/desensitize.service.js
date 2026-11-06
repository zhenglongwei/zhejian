const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const {
  BIZ_TYPE,
  PRE_MASK_STATUS,
  ASSET_STATUS,
  nodesFingerprint,
  rawUrlLookupKeys,
  indexAssetsByRawUrl,
  lookupAssetByRawUrl,
  shouldReuseMaskedAsset,
  listUnmaskedAlbumAssets,
  collectAssetsFromAlbum,
  resolvePreMaskStatus,
  mapTaskRecord,
  buildPreMaskTaskId,
  buildAuthorizeTaskId,
  buildMerchantColdStartTaskId,
  buildHostMaskTaskId,
  buildReviewPreviewTaskId,
  albumToNodeView,
} = require('./desensitize.constants')
const { resolveDesensitizedUrlForAsset, ensureMediaRecordFromUrl, applyManualMaskToAsset } = require('./media.service')
const { isStubCopyArtifact } = require('../lib/media-file-compare')
const { parseObjectKeyFromPublicUrl, rewriteMediaUrlForCurrentBase, isCollapsedMaskKey } = require('../lib/media-storage')
const { stripUrlQuery } = require('../lib/media-signed-url')
const { listPrivacyDetectionsByImageId } = require('./privacy-detection.service')
const { ROLES } = require('../lib/jwt')
const { assertMerchantAlbumAccess } = require('../lib/merchant-album-access')
const { ALBUM_REVIEW_STATUS } = require('../constants/album-review')
const {
  ensureReviewImagesMasked,
  parseRawReviewImages,
} = require('./album-review-image.service')
const { writeMaskedPairsIntoFlowNodes } = require('../utils/flow-photo-mask-writeback')

const MASK_JOB_LIMIT = 1

function isNoPrivacyMaskResult(masked = {}) {
  return Boolean(
    masked.noSensitive ||
      String(masked.maskOutcome || '').trim() === 'ok_no_privacy' ||
      (masked.ok &&
        !String(masked.maskedUrl || '').trim() &&
        !(Array.isArray(masked.riskTags) && masked.riskTags.length)),
  )
}

function assetStatusFromMaskResult(masked = {}) {
  if (String(masked.maskedUrl || '').trim()) return ASSET_STATUS.MASKED_READY
  if (isNoPrivacyMaskResult(masked)) return ASSET_STATUS.MASKED_READY
  return ASSET_STATUS.MASK_FAILED
}

function writebackPairFromMaskResult(rawUrl, masked = {}) {
  const url = String(rawUrl || '').trim()
  if (!url) return null
  const product = String(masked.maskedUrl || '').trim()
  const outcome = String(masked.maskOutcome || '').trim()
  if (product) {
    return {
      rawUrl: url,
      maskedUrl: product,
      maskOutcome: outcome || 'ok_masked',
      maskSource: String(masked.maskSource || '').trim() || 'auto',
      maskRegions: Array.isArray(masked.maskRegions) ? masked.maskRegions : undefined,
    }
  }
  if (isNoPrivacyMaskResult(masked) || outcome === 'ok_no_privacy') {
    return {
      rawUrl: url,
      maskedUrl: '',
      maskOutcome: 'ok_no_privacy',
      maskRegions: [],
    }
  }
  if (outcome) {
    return {
      rawUrl: url,
      maskedUrl: '',
      maskOutcome: outcome,
      maskRegions: Array.isArray(masked.maskRegions) ? masked.maskRegions : [],
    }
  }
  return null
}

function assetMaskSettled(row) {
  if (!row) return false
  const { classifyHostMaskOutcome } = require('../utils/host-mask-outcome')
  const classified = classifyHostMaskOutcome(row)
  if (classified.maskSucceeded && !classified.needsRemask) return true
  const product = String(row.maskedUrl || row.preMaskedUrl || '').trim()
  const ready = [
    ASSET_STATUS.MASKED_READY,
    ASSET_STATUS.MANUAL_MASKED,
    ASSET_STATUS.CONFIRMED,
  ].includes(String(row.status || ''))
  if (product && ready) return true
  const tags = Array.isArray(row.riskTags) ? row.riskTags : []
  // 无敏感已结算：ready 且无产物、无风险标签
  return ready && !product && !tags.length
}

/** 打码成功后写回节点图对象（展示真源）；失败只记日志不挡主流程 */
async function persistMaskedPairsToAlbumFlow(albumId, pairs = []) {
  const id = String(albumId || '').trim()
  const list = (Array.isArray(pairs) ? pairs : []).filter((p) => {
    if (!p || !String(p.rawUrl || '').trim()) return false
    // 有打码图，或明确结论（含 ok_no_privacy）都要写回节点
    return Boolean(String(p.maskedUrl || '').trim() || String(p.maskOutcome || '').trim())
  })
  if (!id || !list.length) return { changed: false }
  try {
    const album = await prisma.album.findUnique({
      where: { id },
      select: { contentPackageJson: true },
    })
    if (!album) return { changed: false }
    const pkg =
      album.contentPackageJson && typeof album.contentPackageJson === 'object'
        ? album.contentPackageJson
        : {}
    const flowNodes = Array.isArray(pkg.flowNodes) ? pkg.flowNodes : []
    if (!flowNodes.length) return { changed: false }
    const { nodes, changed } = writeMaskedPairsIntoFlowNodes(flowNodes, list)
    if (changed) {
      await prisma.album.update({
        where: { id },
        data: { contentPackageJson: { ...pkg, flowNodes: nodes } },
      })
    }
    const { rememberMaskedOnMedia } = require('./media.service')
    for (const pair of list) {
      if (String(pair.maskedUrl || '').trim()) {
        await rememberMaskedOnMedia(pair.rawUrl, pair.maskedUrl)
      }
    }
    return { changed }
  } catch (e) {
    console.warn('[desensitize] writeback maskedUrl to flow failed', e && e.message)
    return { changed: false, error: e }
  }
}

async function mapLimit(list, limit, mapper) {
  const items = Array.isArray(list) ? list : []
  const out = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      out[index] = await mapper(items[index], index)
    }
  }
  const n = Math.max(1, Math.min(Number(limit) || 1, items.length || 1))
  await Promise.all(Array.from({ length: items.length ? n : 0 }, () => worker()))
  return out
}

/**
 * 只重贴：用节点上已有的敏感区重跑贴码引擎，不调大模型。
 * 成功 → ok_masked + maskedUrl；失败 → mask_failed（保留区域，下次还能重贴）。
 * @param {{ rawUrl: string, regions: array, nodeId?: string, idx?: number }[]} items
 */
async function restampHostMaskAssets(items, albumId) {
  const list = Array.isArray(items) ? items : []
  const id = String(albumId || '').trim()
  if (!id || !list.length) return []
  const { resolveDesensitizedUrlForAsset } = require('./media.service')
  const pairs = []
  await mapLimit(list, 2, async (item) => {
    const regions = Array.isArray(item.regions) ? item.regions : []
    let maskedUrl = ''
    try {
      const masked = await resolveDesensitizedUrlForAsset(item.rawUrl, {
        albumId: id,
        nodeId: item.nodeId,
        idx: item.idx,
        boxes: regions,
        // 只用节点区域贴，不再自己检测一遍
        requireBoxes: true,
        force: true,
        modelPrivacyJudged: true,
      })
      maskedUrl = String((masked && masked.maskedUrl) || '').trim()
    } catch (error) {
      console.warn('[runAutoMask] restamp asset failed', {
        message: String((error && error.message) || '').slice(0, 160),
      })
    }
    pairs.push({
      rawUrl: item.rawUrl,
      maskedUrl,
      maskOutcome: maskedUrl ? 'ok_masked' : 'mask_failed',
      maskSource: maskedUrl ? 'auto' : '',
      maskRegions: regions,
    })
    return null
  })
  try {
    await persistMaskedPairsToAlbumFlow(id, pairs)
  } catch (error) {
    console.warn('[runAutoMask] restamp writeback failed', error && error.message)
  }
  return pairs
}

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

/**
 * 托管打码收图：与预览/可公示硬拦同一真源——流程节点挂图。
 * 禁止只扫 document.payload（DOC-FLOW 图住在节点 content；定稿后 payload 常无图 → 误报暂无可脱敏）。
 */
function collectFlowReviewImageUrls(album) {
  const { collectPublicizableFlowPhotos } = require('../utils/flow-public-media')
  const urls = []
  const seen = new Set()
  collectPublicizableFlowPhotos(album).forEach((row) => {
    const stored = String((row && row.url) || '').trim()
    if (!stored) return
    let readable = stored
    try {
      readable = rewriteMediaUrlForCurrentBase(stored) || stored
    } catch (_) {
      readable = stored
    }
    const key = stripUrlQuery(readable)
    if (!key || seen.has(key)) return
    seen.add(key)
    urls.push(readable)
  })
  return urls
}

function flowAssetId(url) {
  const crypto = require('crypto')
  return `flow_${crypto.createHash('sha1').update(stripUrlQuery(url)).digest('hex').slice(0, 16)}`
}

function assetCoversUrl(assets, url) {
  const keys = new Set(rawUrlLookupKeys(url))
  return (assets || []).some((row) => rawUrlLookupKeys(row && (row.rawUrl || row.url)).some((key) => keys.has(key)))
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
  const album = await loadAlbumWithRelations(albumId)
  const includeReview = await shouldIncludeReviewInAuthorizePreview(albumId)
  const reviewAssets = includeReview ? await buildReviewAuthorizeAssetInputs(albumId) : []
  let albumAssets = (preMaskTask.assets || []).map(mapPreMaskAssetToAuthorizeInput)
  if (config.publicViewV2 && album) {
    albumAssets = albumAssets.filter((asset) => isPublicAuthorizeAsset(album, asset))
  }
  return [...albumAssets, ...reviewAssets]
}

function isPublicAuthorizeAsset(album, asset) {
  const {
    albumUsesFlowNodes,
    collectPublicizableFlowPhotos,
  } = require('../utils/flow-public-media')
  if (albumUsesFlowNodes(album)) {
    const raw = String((asset && (asset.rawUrl || asset.url)) || '').trim()
    if (!raw) return false
    const { stripUrlQuery } = require('../lib/media-signed-url')
    const key = stripUrlQuery(raw)
    return collectPublicizableFlowPhotos(album).some((row) => {
      const u = stripUrlQuery(String((row && row.url) || ''))
      return u && (u === key || u === raw || String(row.url) === raw)
    })
  }
  const row = (album.images || []).find(
    (img) =>
      String(img.nodeId) === String(asset.nodeId) &&
      Number(img.idx) === Number(asset.idx != null ? asset.idx : asset.index),
  )
  if (!row) return false
  return row.visibility === 'public' && row.publicGateStatus === 'passed'
}

async function loadAlbumWithRelations(albumId) {
  return prisma.album.findUnique({
    where: { id: albumId },
    include: {
      order: true,
      nodes: { orderBy: { sortOrder: 'asc' } },
    },
  })
}

function canIncludePrivacyDetections(options = {}) {
  if (options.includeDetections === true) return true
  const roles = options.roles || []
  return roles.includes(ROLES.SYSTEM)
}

async function assertDesensitizeTaskAccess(task, auth = {}) {
  if (!task) {
    const err = new Error('脱敏任务不存在')
    err.status = 404
    throw err
  }
  const roles = auth.roles || []
  if (roles.includes(ROLES.SYSTEM)) return

  if (task.bizType === BIZ_TYPE.SERVICE_REVIEW_PREVIEW) {
    const review = await prisma.serviceAlbumReview.findUnique({
      where: { id: task.bizId },
      select: { userId: true },
    })
    if (!review || review.userId !== auth.userId) {
      const err = new Error('无权访问该脱敏任务')
      err.status = 403
      throw err
    }
    return
  }

  const albumId = String(task.bizId || task.albumId || '').trim()
  if (!albumId) {
    const err = new Error('无权访问该脱敏任务')
    err.status = 403
    throw err
  }

  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { userId: true, userPhone: true, merchantId: true },
  })
  if (!album) {
    const err = new Error('无权访问该脱敏任务')
    err.status = 403
    throw err
  }

  if (roles.includes(ROLES.MERCHANT) && auth.merchantId && album.merchantId === auth.merchantId) {
    return
  }

  if (roles.includes(ROLES.USER) && auth.userId) {
    if (album.userId === auth.userId) return
    if (album.userPhone) {
      const user = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { phone: true },
      })
      if (user?.phone && album.userPhone === user.phone) return
    }
  }

  const err = new Error('无权访问该脱敏任务')
  err.status = 403
  throw err
}

function normalizeTaskAuthOptions(options = {}) {
  if (options.auth) return options.auth
  if (options.roles) return { roles: options.roles }
  return null
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

async function enrichTaskWithPublicViewPreview(mapped, taskRecord) {
  if (!mapped || !taskRecord || mapped.bizType !== BIZ_TYPE.SERVICE_AUTHORIZE) return mapped
  if (!config.publicViewV2) return mapped
  const album = await prisma.album.findUnique({
    where: { id: taskRecord.bizId },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!album) return mapped
  const preMaskTask = await findPreMaskTask(taskRecord.bizId)
  const preview = buildAuthorizePreviewPayload(album, taskRecord, preMaskTask)
  return {
    ...mapped,
    publicMediaCount: preview.publicMediaCount,
    hasRepairPlanText: preview.hasRepairPlanText,
    publicViewHint: preview.publicViewHint,
  }
}

async function getTaskById(taskId, options = {}) {
  const task = await prisma.desensitizeTask.findUnique({
    where: { taskId },
    include: { assets: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] } },
  })
  const mapped = mapTaskRecord(task)
  const auth = normalizeTaskAuthOptions(options)
  if (mapped && auth) {
    await assertDesensitizeTaskAccess(mapped, auth)
  }
  let enriched = await enrichTaskWithPrivacyDetections(mapped, options)
  enriched = await enrichTaskWithPublicViewPreview(enriched, task)
  return enriched
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

async function collectStubRawUrlKeys(preMaskTask) {
  const keys = new Set()
  if (!preMaskTask?.assets?.length) return keys
  for (const asset of preMaskTask.assets) {
    const rawUrl = asset.rawUrl
    if (!rawUrl) continue
    const rawKey = parseObjectKeyFromPublicUrl(rawUrl)
    const maskedUrl = asset.maskedUrl || asset.preMaskedUrl
    const maskedKey = maskedUrl ? parseObjectKeyFromPublicUrl(maskedUrl) : ''
    let stub = Boolean(rawKey && maskedKey && isStubCopyArtifact(rawKey, maskedKey))
    if (!stub) {
      const media = await ensureMediaRecordFromUrl(rawUrl)
      stub = Boolean(
        media?.desensitizedKey &&
          media.desensitizeStatus === 'success' &&
          isStubCopyArtifact(media.objectKey, media.desensitizedKey),
      )
    }
    if (!stub) continue
    console.info('[desensitize] stub copy in pre-mask task asset', { rawUrl: rawKey || rawUrl })
    rawUrlLookupKeys(rawUrl).forEach((key) => keys.add(key))
  }
  return keys
}

async function preMaskTaskHasStubArtifacts(preMaskTask) {
  const keys = await collectStubRawUrlKeys(preMaskTask)
  return keys.size > 0
}

function isRawUrlInKeySet(keySet, rawUrl) {
  if (!keySet || !keySet.size) return false
  return rawUrlLookupKeys(rawUrl).some((key) => keySet.has(key))
}

function fillPreMaskLookupMaps(task) {
  const byRawUrl = new Map()
  const byNodeIdx = new Map()
  ;(task?.assets || []).forEach((asset) => {
    const masked = String(asset.maskedUrl || asset.preMaskedUrl || '').trim()
    if (!masked) return
    const raw = String(asset.rawUrl || '').trim()
    if (raw) {
      byRawUrl.set(raw, masked)
      byRawUrl.set(stripUrlQuery(raw), masked)
      try {
        byRawUrl.set(rewriteMediaUrlForCurrentBase(raw), masked)
        byRawUrl.set(stripUrlQuery(rewriteMediaUrlForCurrentBase(raw)), masked)
      } catch (_) {
        /* ignore */
      }
    }
    if (asset.nodeId != null && asset.idx != null) {
      byNodeIdx.set(`${asset.nodeId}:${Number(asset.idx)}`, masked)
    }
  })
  return { byRawUrl, byNodeIdx }
}

function notifyPreMaskReadyForGeoLlm(albumId, preMaskStatus) {
  if (![PRE_MASK_STATUS.READY, PRE_MASK_STATUS.PARTIAL_FAILED].includes(preMaskStatus)) return
  const { scheduleCaseGeoLlmForAlbum } = require('./case-geo-llm.service')
  scheduleCaseGeoLlmForAlbum(albumId, { trigger: 'pre_mask_ready' })
}

function notifyPreMaskLifecycle(albumId, preMaskStatus) {
  setImmediate(() => {
    Promise.resolve()
      .then(async () => {
        const terminal = [
          PRE_MASK_STATUS.READY,
          PRE_MASK_STATUS.PARTIAL_FAILED,
          PRE_MASK_STATUS.FAILED,
        ].includes(preMaskStatus)
        if (terminal) {
          try {
            const { promoteAlbumCaseToPendingReview } = require('./public-case.service')
            await promoteAlbumCaseToPendingReview(albumId)
          } catch (e) {
            console.warn('[case-review] promote after pre-mask failed', albumId, e && e.message)
          }
        }
        if ([PRE_MASK_STATUS.READY, PRE_MASK_STATUS.PARTIAL_FAILED].includes(preMaskStatus)) {
          // 车主审前不可见相册：脱敏就绪不再通知车主打开相册；仅刷新案例稿配图链路
          try {
            const { flushQueuedNodeAiReviewsForAlbum } = require('./node-ai-review.service')
            await flushQueuedNodeAiReviewsForAlbum(albumId)
          } catch (e) {
            console.warn('[node-ai-review] flush queued', e && e.message)
          }
          return
        }
      })
      .catch((e) => {
        console.warn('[desensitize] pre-mask lifecycle notify failed', albumId, e && e.message)
      })
  })
}

const preMaskScheduleInFlight = new Set()

/**
 * 完工后异步预脱敏：不阻塞商家接口；完成后刷新案例稿配图并通知车主。
 * 同一相册进行中不重复开跑，避免生成预览轮询叠打。
 */
function scheduleAlbumPreMask(albumId, options = {}) {
  const id = String(albumId || '').trim()
  if (!id) return
  if (preMaskScheduleInFlight.has(id)) return
  preMaskScheduleInFlight.add(id)
  setImmediate(() => {
    ;(async () => {
      try {
        await ensureOrderPreMaskTask(id, options)
        const { refreshCaseDraftMediaAfterMask } = require('./service-album.service')
        await refreshCaseDraftMediaAfterMask(id)
        // 兜底：确保脱敏结束后升入待审（lifecycle 已调过则 no-op）
        try {
          const { promoteAlbumCaseToPendingReview } = require('./public-case.service')
          await promoteAlbumCaseToPendingReview(id)
        } catch (_) {
          /* ignore */
        }
      } catch (e) {
        console.warn('[desensitize] scheduleAlbumPreMask failed', id, e && e.message)
        try {
          const { promoteAlbumCaseToPendingReview } = require('./public-case.service')
          await promoteAlbumCaseToPendingReview(id)
        } catch (_) {
          /* ignore */
        }
      } finally {
        preMaskScheduleInFlight.delete(id)
      }
    })()
  })
}

function buildVersionedFingerprint(album) {
  const nodeViews = albumToNodeView(album)
  return `${nodesFingerprint(nodeViews)}@${config.desensitize.cacheVersion}`
}

/**
 * 授权 / AI 共用：预脱敏是否可直接复用（不现场补跑 OCR）
 * @returns {{ state: 'ready'|'pending'|'failed', task?: object, reason?: string }}
 */
async function getAlbumPreMaskReadiness(albumId) {
  const album = await loadAlbumWithRelations(albumId)
  if (!album) {
    return { state: 'failed', reason: '相册不存在' }
  }
  const { preMaskBizType } = resolveAlbumBizTypes(album)
  const preMaskTask = await findPreMaskTask(albumId, preMaskBizType)
  if (!preMaskTask) {
    return { state: 'pending', reason: 'pre_mask_missing' }
  }
  if (
    [PRE_MASK_STATUS.RUNNING, PRE_MASK_STATUS.IDLE, null, undefined].includes(
      preMaskTask.preMaskStatus,
    )
  ) {
    return { state: 'pending', task: preMaskTask, reason: 'pre_mask_running' }
  }
  if (preMaskTask.preMaskStatus === PRE_MASK_STATUS.FAILED) {
    return { state: 'failed', task: preMaskTask, reason: 'pre_mask_failed' }
  }
  if (
    ![PRE_MASK_STATUS.READY, PRE_MASK_STATUS.PARTIAL_FAILED].includes(preMaskTask.preMaskStatus)
  ) {
    return { state: 'pending', task: preMaskTask, reason: 'pre_mask_unknown' }
  }

  const stubArtifacts = await preMaskTaskHasStubArtifacts(preMaskTask)
  if (stubArtifacts) {
    return {
      state: 'pending',
      task: preMaskTask,
      reason: 'stub_artifacts',
      needsForceRefresh: false,
    }
  }

  const nodeViews = albumToNodeView(album)
  const missing = listUnmaskedAlbumAssets(
    collectAssetsFromAlbum({ nodes: nodeViews }),
    preMaskTask.assets,
  )
  if (missing.length) {
    return {
      state: 'pending',
      task: preMaskTask,
      reason: 'assets_unmasked',
      needsForceRefresh: false,
    }
  }
  return { state: 'ready', task: preMaskTask }
}

/** 已打码图索引。只读现有名单，不扫整本是否就绪（归组不得等整本）。 */
async function buildPreMaskUrlLookup(albumId) {
  const task = await findPreMaskTask(albumId)
  const maps = fillPreMaskLookupMaps(task)
  return {
    ready: maps.byRawUrl.size > 0,
    ...maps,
    task,
  }
}

/** 认单张：先名单、再媒体成功标识，没有才打这一张。不等整本就绪。终态失败不再打。 */
async function resolveMaskedOutcomeForRaw(rawUrl, lookup = { byRawUrl: new Map() }) {
  const raw = String(rawUrl || '').trim()
  if (!raw) return { settled: true, masked: '' }
  const byRawUrl = lookup.byRawUrl || new Map()
  const hit =
    byRawUrl.get(raw) ||
    byRawUrl.get(stripUrlQuery(raw)) ||
    ''
  if (hit) return { settled: true, masked: hit }
  const media = await ensureMediaRecordFromUrl(raw)
  if (media && media.desensitizeStatus === 'success') {
    const product = String(media.desensitizedUrl || '').trim()
    if (product && !isCollapsedMaskKey(media.desensitizedKey)) {
      return { settled: true, masked: product }
    }
    // success 且无产物 = 已跑过且无敏感，不必再打；展示用原图
    const tags = Array.isArray(media.riskTags) ? media.riskTags : []
    if (!tags.length) {
      return { settled: true, masked: '', noPrivacy: true }
    }
  }
  if (
    media &&
    (media.desensitizeStatus === 'need_manual' || media.desensitizeStatus === 'failed')
  ) {
    return { settled: true, masked: '', needManual: media.desensitizeStatus === 'need_manual' }
  }
  const masked = await resolveDesensitizedUrlForAsset(raw, { force: false })
  if (masked && masked.ok && masked.maskedUrl) {
    return { settled: true, masked: String(masked.maskedUrl).trim() }
  }
  if (masked && masked.settled) {
    return { settled: true, masked: '', needManual: Boolean(masked.needManual) }
  }
  return { settled: false, masked: '' }
}

async function resolveMaskedUrlForRaw(rawUrl, lookup = { byRawUrl: new Map() }) {
  const outcome = await resolveMaskedOutcomeForRaw(rawUrl, lookup)
  return outcome.masked || ''
}

async function collectMaskedUrlsForRawList(albumId, entries = [], options = {}) {
  const requireAllSuccess = options.requireAll === true
  const lookup = await buildPreMaskUrlLookup(albumId)
  const packed = await mapLimit(entries || [], MASK_JOB_LIMIT, async (row, i) => {
      const raw = String((row && row.url) || '').trim()
      if (!raw) return { skip: true, index: i, settled: true }
      const outcome = await resolveMaskedOutcomeForRaw(raw, lookup)
      if (!outcome.masked) {
        return {
          skip: false,
          index: i,
          raw,
          masked: '',
          settled: Boolean(outcome.settled),
        }
      }
      lookup.byRawUrl.set(raw, outcome.masked)
      lookup.byRawUrl.set(stripUrlQuery(raw), outcome.masked)
      return {
        skip: false,
        index: i,
        raw,
        masked: outcome.masked,
        settled: true,
        item: {
          url: outcome.masked,
          label: (row && row.label) || `图${i + 1}`,
          rawUrl: raw,
          imageKey: (row && row.imageKey) || '',
        },
      }
  })
  if (packed.some((row) => row && !row.skip && !row.settled)) {
    return { ready: false, urls: [] }
  }
  if (requireAllSuccess && packed.some((row) => row && !row.skip && !row.masked)) {
    return { ready: false, urls: [] }
  }
  return {
    ready: true,
    urls: packed.map((row) => row && row.item).filter(Boolean),
  }
}

async function ensureOrderPreMaskTask(albumId, options = {}) {
  const album = await loadAlbumWithRelations(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.code = 100004
    err.status = 404
    throw err
  }
  const auth = normalizeTaskAuthOptions(options)
  if (auth && !(auth.roles || []).includes(ROLES.SYSTEM)) {
    if ((auth.roles || []).includes(ROLES.MERCHANT) && auth.merchantId) {
      assertMerchantAlbumAccess(album, auth.merchantId)
    } else {
      const err = new Error('无权触发预脱敏')
      err.status = 403
      throw err
    }
  }
  const { preMaskBizType, authorizeBizType } = {
    ...resolveAlbumBizTypes(album),
    ...options,
  }
  const nodeViews = albumToNodeView(album)
  const fingerprint = nodesFingerprint(nodeViews)
  const versionedFingerprint = `${fingerprint}@${config.desensitize.cacheVersion}`
  const existing = await findPreMaskTask(albumId, preMaskBizType)
  // force = 整本重打；resync = 只对账资产列表，已成功打码的继续复用（托管预览二次补漏用）
  let albumForce = Boolean(options.force)
  const resync = Boolean(options.resync)
  const stubKeys = await collectStubRawUrlKeys(existing)

  if (
    existing &&
    existing.fingerprint === versionedFingerprint &&
    [PRE_MASK_STATUS.READY, PRE_MASK_STATUS.PARTIAL_FAILED].includes(existing.preMaskStatus) &&
    !albumForce &&
    !resync &&
    !stubKeys.size
  ) {
    return mapTaskRecord(existing)
  }

  if (existing && existing.fingerprint !== versionedFingerprint) {
    await clearPendingAuthorizeTasks(albumId, authorizeBizType)
  }

  const taskId = buildPreMaskTaskId(albumId)
  const preMaskVersion = (existing?.preMaskVersion || 0) + 1
  const prevIndex = indexAssetsByRawUrl(existing && existing.assets)
  const currentAssets = collectAssetsFromAlbum({ nodes: nodeViews })
  let reuseCount = 0
  let maskCount = 0
  const assetInputs = await mapLimit(currentAssets, MASK_JOB_LIMIT, async (asset) => {
      const prev = lookupAssetByRawUrl(prevIndex, asset.rawUrl)
      const stub = isRawUrlInKeySet(stubKeys, asset.rawUrl)
      if (shouldReuseMaskedAsset(prev, { albumForce, stub })) {
        reuseCount += 1
        const maskedUrl = String(prev.maskedUrl || prev.preMaskedUrl || '').trim()
        return {
          assetId: asset.assetId,
          mediaId: prev.mediaId || '',
          nodeId: asset.nodeId,
          nodeTitle: asset.nodeTitle,
          idx: asset.idx,
          rawUrl: asset.rawUrl,
          maskedUrl,
          preMaskedUrl: maskedUrl,
          status: prev.status || ASSET_STATUS.MASKED_READY,
          previewed: false,
          riskTags: prev.riskTags || [],
          riskLevel: prev.riskLevel || 'low',
        }
      }
      maskCount += 1
      return {
        assetId: asset.assetId,
        mediaId: (prev && prev.mediaId) || '',
        nodeId: asset.nodeId,
        nodeTitle: asset.nodeTitle,
        idx: asset.idx,
        rawUrl: asset.rawUrl,
        maskedUrl: '',
        preMaskedUrl: '',
        status: ASSET_STATUS.RAW_UPLOADED,
        previewed: false,
        riskTags: [],
        riskLevel: '',
      }
  })
  console.info('[desensitize] incremental pre-mask', {
    albumId,
    reuse: reuseCount,
    mask: maskCount,
    albumForce,
  })
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

  await persistMaskedPairsToAlbumFlow(
    albumId,
    assetInputs
      .filter((row) => row && row.rawUrl && row.maskedUrl)
      .map((row) => ({ rawUrl: row.rawUrl, maskedUrl: row.maskedUrl })),
  )

  notifyPreMaskReadyForGeoLlm(albumId, preMaskStatus)
  notifyPreMaskLifecycle(albumId, preMaskStatus)

  return getTaskById(taskId)
}

function throwAuthorizePreMaskNotReady(message, code = 100007) {
  const err = new Error(message)
  err.code = code
  err.status = 409
  throw err
}

async function createAlbumAuthorizeTaskFromPreMask(albumId) {
  const album = await loadAlbumWithRelations(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.code = 100004
    err.status = 404
    throw err
  }

  const { buildAlbumView } = require('./service-album.service')
  const { assertPublicCaseQualityReady } = require('./public-case-quality.service')
  assertPublicCaseQualityReady(buildAlbumView(album))

  const { authorizeBizType } = resolveAlbumBizTypes(album)
  const readiness = await getAlbumPreMaskReadiness(albumId)

  if (readiness.state === 'pending') {
    scheduleAlbumPreMask(albumId, {
      force: Boolean(readiness.needsForceRefresh),
      auth: { roles: [ROLES.SYSTEM] },
    })
    throwAuthorizePreMaskNotReady('配图脱敏处理中，完成后会通知你，请稍后再试')
  }

  if (readiness.state === 'failed') {
    throwAuthorizePreMaskNotReady('配图脱敏未完成，暂无法发布到公开网站')
  }

  const preMaskTask = readiness.task
  if (!preMaskTask) {
    throwAuthorizePreMaskNotReady('配图脱敏处理中，完成后会通知你，请稍后再试')
  }

  if (preMaskTask.preMaskStatus === PRE_MASK_STATUS.FAILED) {
    throwAuthorizePreMaskNotReady('配图脱敏未完成，暂无法发布到公开网站')
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
  const { buildAlbumView } = require('./service-album.service')
  const { buildPublicView } = require('./build-public-view.service')
  const albumView = buildAlbumView(album)
  const publicView = config.publicViewV2
    ? buildPublicView(albumView, preMaskTask, { authorizationTier: 'named' })
    : null
  const publicMediaCount = publicView ? publicView.publicMediaCount : (task.assets || []).length
  return {
    taskId: task.taskId,
    albumId: album.id,
    orderId: album.orderId,
    fromPreMask: Boolean((task.fromPreMask ?? true) && preMaskReady),
    preMaskTaskId: task.preMaskTaskId || '',
    preMaskVersion: task.preMaskVersion || 0,
    publicMediaCount,
    hasRepairPlanText: publicView ? publicView.hasRepairPlanText : true,
    publicViewHint:
      publicMediaCount < 1
        ? '当前暂无可公示的过程图（含敏感信息的图片已自动仅留档）。仍可授权，但公开案例将以文字为主。'
        : '',
  }
}

async function loadStoredMaskBoxes(mediaId) {
  const id = String(mediaId || '').trim()
  if (!id) return []
  try {
    const rows = await listPrivacyDetectionsByImageId(id, { includeResultJson: true })
    const boxes = []
    ;(rows || []).forEach((row) => {
      const list =
        row && row.resultJson && Array.isArray(row.resultJson.boxes) ? row.resultJson.boxes : []
      list.forEach((box) => {
        if (box && typeof box === 'object') boxes.push(box)
      })
    })
    return boxes
  } catch (_) {
    return []
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
  const mapped = mapTaskRecord(task)
  const auth = normalizeTaskAuthOptions(options)
  if (auth) await assertDesensitizeTaskAccess(mapped, auth)
  if (
    task.bizType === BIZ_TYPE.ORDER_PRE_MASK ||
    task.bizType === BIZ_TYPE.SERVICE_PRE_MASK
  ) {
    const err = new Error('预脱敏任务由系统自动处理，无需手动脱敏')
    err.status = 400
    throw err
  }
  // 托管公开：整案对账、按张处理。已成功跳过；未跑大模型/模型失败重跑模型；贴码失败只重贴。
  const hostPublic =
    String(task.taskId || '').startsWith('task_host_mask_') ||
    task.bizType === BIZ_TYPE.MERCHANT_HISTORY
  const { classifyHostMaskOutcome } = require('../utils/host-mask-outcome')
  const {
    lookupHostMaskOutcomeRow,
    loadHostMaskOutcomeIndex,
    loadHostNodeImageUrlKeys,
  } = require('./hosted-public-mask.service')

  let nodeOutcomeIndex = new Map()
  let nodeUrlKeys = new Set()
  if (hostPublic) {
    try {
      nodeOutcomeIndex = await loadHostMaskOutcomeIndex(task.bizId)
    } catch (_) {
      nodeOutcomeIndex = new Map()
    }
    try {
      nodeUrlKeys = await loadHostNodeImageUrlKeys(task.bizId)
    } catch (_) {
      nodeUrlKeys = new Set()
    }
  }

  // 幽灵资产：任务行指向的 URL 在当前节点图集合里已不存在（旧引擎时代遗留行）。
  // 重跑大模型也写不回节点，只会白烧模型拖慢每次对账 → 一律跳过。
  const isGhostAsset = (url) => {
    if (!nodeUrlKeys.size) return false
    const { rawUrlLookupKeys } = require('../services/desensitize.constants')
    return !rawUrlLookupKeys(url).some((key) => nodeUrlKeys.has(key))
  }

  const classifyAsset = (asset) => {
    const nodeRow = hostPublic
      ? lookupHostMaskOutcomeRow(nodeOutcomeIndex, asset.rawUrl)
      : null
    const classified = classifyHostMaskOutcome(
      {
        status: asset.status,
        desensitizeStatus: nodeRow && nodeRow.desensitizeStatus,
        riskTags: (nodeRow && nodeRow.riskTags) || (!hostPublic && asset.riskTags) || [],
        // 托管只认节点产物；任务行残留的 maskedUrl 不得当结论
        maskedUrl: hostPublic
          ? (nodeRow && (nodeRow.maskedUrl || nodeRow.preMaskedUrl)) || ''
          : asset.maskedUrl || asset.preMaskedUrl || '',
        preMaskedUrl: hostPublic
          ? (nodeRow && nodeRow.preMaskedUrl) || ''
          : asset.preMaskedUrl || '',
        maskOutcome: (nodeRow && nodeRow.maskOutcome) || '',
        maskSource: (nodeRow && nodeRow.maskSource) || '',
        maskRegions: (nodeRow && nodeRow.maskRegions) || [],
        needManual: Boolean(asset.needManual),
      },
      hostPublic ? { nodeOnly: true } : {},
    )
    if (
      hostPublic &&
      (classified.hostAction === 'rerun_llm' || classified.hostAction === 'restamp') &&
      isGhostAsset(asset.rawUrl)
    ) {
      return {
        ...classified,
        hostAction: 'skip',
        ghost: true,
        maskSucceeded: false,
        allowsOriginalPublish: false,
      }
    }
    return classified
  }

  if (hostPublic) {
    const llmUrls = []
    const restampItems = []
    ;(task.assets || []).forEach((asset) => {
      if (!asset) return
      const url = String(asset.rawUrl || '').trim()
      if (!url) return
      const classified = classifyAsset(asset)
      if (classified.hostAction === 'rerun_llm') {
        llmUrls.push(url)
        return
      }
      if (classified.hostAction === 'restamp') {
        const nodeRow = lookupHostMaskOutcomeRow(nodeOutcomeIndex, url)
        const regions = Array.isArray(nodeRow && nodeRow.maskRegions) ? nodeRow.maskRegions : []
        // 区域丢了没法只重贴，回退跑模型
        if (!regions.length) {
          llmUrls.push(url)
          return
        }
        restampItems.push({ rawUrl: url, regions, nodeId: asset.nodeId, idx: asset.idx })
      }
    })
    console.info('[runAutoMask] host privacy queue', {
      albumId: task.bizId,
      totalAssets: (task.assets || []).length,
      needLlm: llmUrls.length,
      needRestamp: restampItems.length,
    })
    if (restampItems.length) {
      try {
        await restampHostMaskAssets(restampItems, task.bizId)
      } catch (error) {
        console.warn('[runAutoMask] host restamp failed', error && error.message)
      }
    }
    if (llmUrls.length) {
      try {
        const { rerunHostPrivacyLlmForUrls } = require('./host-privacy-llm.service')
        await rerunHostPrivacyLlmForUrls(llmUrls, { albumId: task.bizId })
      } catch (error) {
        console.warn('[runAutoMask] host privacy llm batch failed', error && error.message)
      }
    }
    if (llmUrls.length || restampItems.length) {
      try {
        nodeOutcomeIndex = await loadHostMaskOutcomeIndex(task.bizId)
      } catch (_) {
        /* keep previous */
      }
    }
  }

  await mapLimit(task.assets || [], MASK_JOB_LIMIT, async (asset) => {
      if (!asset) return null
      const nodeRow = hostPublic
        ? lookupHostMaskOutcomeRow(nodeOutcomeIndex, asset.rawUrl)
        : null
      const syncSettledFromNode = (classified) => {
        const product = String(
          (nodeRow && (nodeRow.maskedUrl || nodeRow.preMaskedUrl)) ||
            (hostPublic ? '' : asset.maskedUrl || asset.preMaskedUrl) ||
            '',
        ).trim()
        const noPrivacy = classified.outcome === 'ok_no_privacy'
        return prisma.desensitizeAsset.update({
          where: { taskId_assetId: { taskId, assetId: asset.assetId } },
          data: {
            mediaId: asset.mediaId || (nodeRow && nodeRow.mediaId) || '',
            maskedUrl: product,
            preMaskedUrl: product,
            status: ASSET_STATUS.MASKED_READY,
            riskTags: noPrivacy ? [] : asset.riskTags || [],
            riskLevel: noPrivacy ? 'low' : asset.riskLevel || '',
          },
        })
      }
      // 托管：结论只看节点；任务行 settled 不代表节点已登记
      if (!hostPublic && assetMaskSettled(asset)) return null
      const classified = classifyAsset(asset)
      const action = classified.hostAction
      if (action === 'skip') {
        // 已登记成功：任务行可能仍是 raw → 同步结算态
        if (hostPublic && classified.maskSucceeded && !assetMaskSettled(asset)) {
          return syncSettledFromNode(classified)
        }
        // 已登记失败：二次托管不再跑模型，任务行记失败即可
        if (hostPublic && classified.allowsOriginalPublish && !classified.maskSucceeded) {
          return prisma.desensitizeAsset.update({
            where: { taskId_assetId: { taskId, assetId: asset.assetId } },
            data: {
              mediaId: asset.mediaId || '',
              maskedUrl: '',
              preMaskedUrl: '',
              status: ASSET_STATUS.MASK_FAILED,
              riskTags: [],
              riskLevel: '',
            },
          })
        }
        return null
      }

      // 托管：模型/贴码已在上面对账处理，这里只同步任务行
      if (hostPublic && (action === 'rerun_llm' || action === 'restamp')) {
        const after = classifyAsset(asset)
        if (after.maskSucceeded) {
          return syncSettledFromNode(after)
        }
        return prisma.desensitizeAsset.update({
          where: { taskId_assetId: { taskId, assetId: asset.assetId } },
          data: {
            mediaId: asset.mediaId || '',
            maskedUrl: '',
            preMaskedUrl: '',
            status: ASSET_STATUS.MASK_FAILED,
            riskTags: [],
            riskLevel: '',
          },
        })
      }

      // 非托管任务：仍走引擎补打
      const masked = await resolveDesensitizedUrlForAsset(asset.rawUrl, {
        albumId: task.bizId,
        nodeId: asset.nodeId,
        idx: asset.idx,
        retryFailed: false,
      })
      const maskedUrl = masked.ok ? String(masked.maskedUrl || '').trim() : ''
      const status = assetStatusFromMaskResult(masked)
      const noPrivacy = isNoPrivacyMaskResult(masked)
      return prisma.desensitizeAsset.update({
        where: { taskId_assetId: { taskId, assetId: asset.assetId } },
        data: {
          mediaId: masked.mediaId || asset.mediaId || '',
          maskedUrl,
          preMaskedUrl: maskedUrl,
          status,
          riskTags:
            masked.riskTags && masked.riskTags.length
              ? masked.riskTags
              : maskedUrl || noPrivacy
                ? []
                : [],
          riskLevel: masked.riskLevel || (maskedUrl || noPrivacy ? 'low' : ''),
        },
      })
    })
  // 同步任务行 + 把结论登记回节点（成功/失败都要有 maskOutcome）
  try {
    const albumId = String(task.bizId || '').trim()
    if (albumId) {
      if (hostPublic) {
        try {
          nodeOutcomeIndex = await loadHostMaskOutcomeIndex(albumId)
        } catch (_) {
          /* keep */
        }
      }
      const refreshed = await prisma.desensitizeTask.findUnique({
        where: { taskId },
        include: { assets: true },
      })
      const writebackPairs = []
      for (const asset of refreshed.assets || []) {
        const bare = stripUrlQuery(asset.rawUrl || '')
        if (!bare) continue
        const nodeRow = hostPublic
          ? lookupHostMaskOutcomeRow(nodeOutcomeIndex, asset.rawUrl)
          : null
        const nodeMasked = String(
          (nodeRow && (nodeRow.maskedUrl || nodeRow.preMaskedUrl)) || '',
        ).trim()
        const classified = classifyHostMaskOutcome(
          {
            status: hostPublic ? '' : asset.status,
            riskTags: hostPublic ? [] : asset.riskTags || [],
            maskedUrl: hostPublic ? nodeMasked : asset.maskedUrl || asset.preMaskedUrl || '',
            preMaskedUrl: hostPublic ? nodeMasked : asset.preMaskedUrl || '',
            maskOutcome: (nodeRow && nodeRow.maskOutcome) || '',
            maskSource: (nodeRow && nodeRow.maskSource) || '',
            maskRegions: (nodeRow && nodeRow.maskRegions) || [],
          },
          hostPublic ? { nodeOnly: true } : {},
        )
        let pair = writebackPairFromMaskResult(asset.rawUrl, {
          maskedUrl: hostPublic ? nodeMasked : asset.maskedUrl || asset.preMaskedUrl || '',
          ok: hostPublic ? classified.maskSucceeded : assetMaskSettled(asset),
          noSensitive: hostPublic
            ? classified.outcome === 'ok_no_privacy'
            : assetMaskSettled(asset) &&
              !String(asset.maskedUrl || asset.preMaskedUrl || '').trim(),
          riskTags: hostPublic ? [] : asset.riskTags || [],
          maskOutcome: classified.outcome,
          maskSource: hostPublic ? (nodeRow && nodeRow.maskSource) || '' : '',
          maskRegions: (nodeRow && nodeRow.maskRegions) || [],
        })
        // 托管：失败态也必须登记，避免再次托管又当未分析
        if (
          !pair &&
          hostPublic &&
          classified.outcome &&
          classified.outcome !== 'not_analyzed' &&
          classified.outcome !== 'pending'
        ) {
          pair = {
            rawUrl: asset.rawUrl,
            maskedUrl: '',
            maskOutcome: classified.outcome,
            maskRegions: (nodeRow && nodeRow.maskRegions) || [],
          }
        }
        if (!pair) continue
        writebackPairs.push(pair)
        const maskedUrl = pair.maskedUrl || ''
        const siblings = await prisma.desensitizeAsset.findMany({
          where: { task: { bizId: albumId } },
          select: { taskId: true, assetId: true, rawUrl: true },
        })
        await Promise.all(
          siblings
            .filter((row) => !(row.taskId === taskId && row.assetId === asset.assetId))
            .filter((row) => stripUrlQuery(row.rawUrl || '') === bare)
            .map((row) =>
              prisma.desensitizeAsset.update({
                where: { taskId_assetId: { taskId: row.taskId, assetId: row.assetId } },
                data: {
                  mediaId: asset.mediaId || '',
                  maskedUrl,
                  preMaskedUrl: maskedUrl,
                  status: asset.status,
                  riskTags: asset.riskTags || [],
                  riskLevel: asset.riskLevel || '',
                },
              }),
            ),
        )
      }
      await persistMaskedPairsToAlbumFlow(albumId, writebackPairs)
    }
  } catch (e) {
    console.warn('[desensitize] sync auto-mask siblings failed', e && e.message)
  }
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
  notifyPreMaskLifecycle(task.bizId, preMaskStatus)
}

/** 把节点结论同步到任务行（托管任务用；结论真源仍在节点） */
async function syncAssetRowFromNode(taskId, asset, albumId) {
  const {
    loadHostMaskOutcomeIndex,
    lookupHostMaskOutcomeRow,
  } = require('./hosted-public-mask.service')
  const { classifyHostMaskOutcome } = require('../utils/host-mask-outcome')
  const index = await loadHostMaskOutcomeIndex(albumId)
  const nodeRow = lookupHostMaskOutcomeRow(index, asset.rawUrl)
  const classified = classifyHostMaskOutcome(nodeRow || {}, { nodeOnly: true })
  const product = String((nodeRow && (nodeRow.maskedUrl || nodeRow.preMaskedUrl)) || '').trim()
  await prisma.desensitizeAsset.update({
    where: { taskId_assetId: { taskId, assetId: asset.assetId } },
    data: {
      mediaId: asset.mediaId || '',
      maskedUrl: product,
      preMaskedUrl: product,
      status: classified.maskSucceeded ? ASSET_STATUS.MASKED_READY : ASSET_STATUS.MASK_FAILED,
      riskTags: classified.outcome === 'ok_no_privacy' ? [] : asset.riskTags || [],
      riskLevel: classified.maskSucceeded ? 'low' : '',
    },
  })
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
  const auth = normalizeTaskAuthOptions(options)
  if (auth) {
    await assertDesensitizeTaskAccess(mapTaskRecord(asset.task), auth)
  }
  // 托管任务：按节点结论分派（成功跳过 / 模型失败重跑模型 / 贴码失败只重贴）
  const retryAlbumId = String(asset.task.bizId || '').trim()
  const retryHostPublic =
    String(asset.task.taskId || '').startsWith('task_host_mask_') ||
    asset.task.bizType === BIZ_TYPE.MERCHANT_HISTORY
  if (retryHostPublic && retryAlbumId) {
    const {
      loadHostMaskOutcomeIndex,
      lookupHostMaskOutcomeRow,
    } = require('./hosted-public-mask.service')
    const { classifyHostMaskOutcome } = require('../utils/host-mask-outcome')
    const index = await loadHostMaskOutcomeIndex(retryAlbumId)
    const nodeRow = lookupHostMaskOutcomeRow(index, asset.rawUrl)
    const classified = classifyHostMaskOutcome(nodeRow || {}, { nodeOnly: true })
    if (classified.maskSucceeded) return getTaskById(taskId, options)
    const regions = Array.isArray(nodeRow && nodeRow.maskRegions) ? nodeRow.maskRegions : []
    if (classified.outcome === 'mask_failed' && regions.length) {
      await restampHostMaskAssets(
        [{ rawUrl: asset.rawUrl, regions, nodeId: asset.nodeId, idx: asset.idx }],
        retryAlbumId,
      )
    } else {
      const { rerunHostPrivacyLlmForUrls } = require('./host-privacy-llm.service')
      await rerunHostPrivacyLlmForUrls([asset.rawUrl], { albumId: retryAlbumId })
    }
    await syncAssetRowFromNode(taskId, asset, retryAlbumId)
    await refreshPreMaskStatusForTask(taskId)
    return getTaskById(taskId, options)
  }
  const masked = await resolveDesensitizedUrlForAsset(asset.rawUrl, {
    albumId: asset.task.bizId,
    nodeId: asset.nodeId,
    idx: asset.idx,
    force: Boolean(options.force),
  })
  const maskedUrl = masked.ok ? String(masked.maskedUrl || '').trim() : ''
  const status = assetStatusFromMaskResult(masked)
  const noPrivacy = isNoPrivacyMaskResult(masked)
  await prisma.desensitizeAsset.update({
    where: { taskId_assetId: { taskId, assetId } },
    data: {
      mediaId: masked.mediaId || asset.mediaId || '',
      maskedUrl,
      preMaskedUrl: maskedUrl,
      status,
      riskTags:
        masked.riskTags && masked.riskTags.length
          ? masked.riskTags
          : maskedUrl || noPrivacy
            ? []
            : [],
      riskLevel: masked.riskLevel || (maskedUrl || noPrivacy ? 'low' : ''),
    },
  })
  const pair = writebackPairFromMaskResult(asset.rawUrl, masked)
  if (pair) {
    await persistMaskedPairsToAlbumFlow(asset.task.bizId, [pair])
  }
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
  const auth = normalizeTaskAuthOptions(options)
  if (auth) await assertDesensitizeTaskAccess(mapTaskRecord(task), auth)
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
  // 同步到同相册其它脱敏任务（含 pre_mask），并写回节点图对象
  try {
    const albumId = String(task.bizId || '').trim()
    const bare = stripUrlQuery(asset.rawUrl || '')
    if (albumId && bare) {
      const siblings = await prisma.desensitizeAsset.findMany({
        where: { task: { bizId: albumId } },
        select: { taskId: true, assetId: true, rawUrl: true },
      })
      await Promise.all(
        siblings
          .filter((row) => !(row.taskId === taskId && row.assetId === assetId))
          .filter((row) => stripUrlQuery(row.rawUrl || '') === bare)
          .map((row) =>
            prisma.desensitizeAsset.update({
              where: { taskId_assetId: { taskId: row.taskId, assetId: row.assetId } },
              data: {
                mediaId: result.mediaId || asset.mediaId || '',
                maskedUrl: result.maskedUrl,
                preMaskedUrl: result.maskedUrl,
                status: ASSET_STATUS.MANUAL_MASKED,
              },
            }),
          ),
      )
      await persistMaskedPairsToAlbumFlow(albumId, [
        {
          rawUrl: asset.rawUrl,
          maskedUrl: result.maskedUrl,
          maskOutcome: 'ok_masked',
          // 手工打码标记：此后永不再跑模型、永不再自动贴码
          maskSource: 'manual',
        },
      ])
    }
  } catch (e) {
    console.warn('[desensitize] sync manual mask siblings failed', e && e.message)
  }
  await refreshPreMaskStatusForTask(taskId)
  return getTaskById(taskId, options)
}

async function markAssetPreviewed(taskId, assetId, options = {}) {
  const auth = normalizeTaskAuthOptions(options)
  if (auth) {
    const task = await prisma.desensitizeTask.findUnique({ where: { taskId } })
    if (task) await assertDesensitizeTaskAccess(mapTaskRecord(task), auth)
  }
  await prisma.desensitizeAsset.updateMany({
    where: { taskId, assetId },
    data: { previewed: true },
  })
  return getTaskById(taskId, options)
}

/**
 * PKG-COACH：车主从公开配图包移除（可删不可加）
 * 只删授权任务资产；不再回写已废止的 album_images 闸。
 */
async function excludeAuthorizeAsset(taskId, assetId, options = {}) {
  const row = await prisma.desensitizeAsset.findUnique({
    where: { taskId_assetId: { taskId, assetId } },
    include: { task: true },
  })
  if (!row || !row.task) {
    const err = new Error('图片资源不存在')
    err.status = 404
    throw err
  }
  const auth = normalizeTaskAuthOptions(options)
  if (auth) {
    await assertDesensitizeTaskAccess(mapTaskRecord(row.task), auth)
  }
  const bizType = row.task.bizType
  if (
    bizType !== BIZ_TYPE.SERVICE_AUTHORIZE &&
    bizType !== BIZ_TYPE.ORDER_AUTHORIZE
  ) {
    const err = new Error('仅公开授权预览支持移除配图')
    err.status = 400
    throw err
  }

  await prisma.desensitizeAsset.delete({
    where: { taskId_assetId: { taskId, assetId } },
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
  const auth = normalizeTaskAuthOptions(opts)
  if (auth) await assertDesensitizeTaskAccess(task, auth)
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
  const auth = normalizeTaskAuthOptions(opts)
  if (auth) await assertDesensitizeTaskAccess(task, auth)
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
  const missingAssets = listUnmaskedAlbumAssets(
    collectAssetsFromAlbum({ nodes: nodeViews }),
    preMaskTask?.assets,
  )
  const fingerprintChanged = Boolean(preMaskTask && preMaskTask.fingerprint !== versionedFingerprint)
  const preMaskAssetCount = (preMaskTask?.assets || []).length
  const preMaskFailedNeedsRetry =
    preMaskTask?.preMaskStatus === PRE_MASK_STATUS.FAILED && preMaskAssetCount > 0
  const needsPreMaskRefresh =
    !preMaskTask ||
    fingerprintChanged ||
    missingAssets.length > 0 ||
    [PRE_MASK_STATUS.RUNNING, PRE_MASK_STATUS.IDLE, null].includes(
      preMaskTask?.preMaskStatus
    ) ||
    preMaskFailedNeedsRetry ||
    stubArtifacts

  if (needsPreMaskRefresh) {
    await ensureOrderPreMaskTask(albumId, {
      force: false,
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

/**
 * 托管公开核对：创建/刷新商家可编辑脱敏任务（支持一键 AI / 手工打码）
 * 与系统 pre_mask 分离，避免「预脱敏无需手动」拦截。
 */
async function ensureHostMerchantMaskTask(albumId, options = {}) {
  const album = await loadAlbumWithRelations(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  const auth = normalizeTaskAuthOptions(options)
  if (auth && (auth.roles || []).includes(ROLES.MERCHANT) && auth.merchantId) {
    assertMerchantAlbumAccess(album, auth.merchantId)
  }

  let preMaskTask = await findPreMaskTask(albumId)
  const needsRefresh =
    !preMaskTask ||
    [PRE_MASK_STATUS.RUNNING, PRE_MASK_STATUS.IDLE, null, ''].includes(
      preMaskTask.preMaskStatus,
    ) ||
    Boolean(options.force)

  if (needsRefresh || !preMaskTask) {
    // 托管预览的 force 只对账补漏，禁止整本重打（否则 12 张图并发 OCR 易顶穿内存被 PM2 杀掉 → 502）
    await ensureOrderPreMaskTask(albumId, {
      force: false,
      resync: Boolean(options.force),
      auth: auth || { roles: [ROLES.SYSTEM] },
    })
    preMaskTask = await findPreMaskTask(albumId)
  }

  const flowUrls = collectFlowReviewImageUrls(album)
  // 交车 deliveryPhotos 等可能仅在 flow 侧；无 pre-mask 时仍须用 flow 图建托管任务
  if (!flowUrls.length && (!(preMaskTask && preMaskTask.assets) || !(preMaskTask.assets || []).length)) {
    const err = new Error('本单暂无过程图可脱敏')
    err.status = 409
    err.code = 'HOST_MASK_NO_ASSETS'
    throw err
  }

  const taskId = buildHostMaskTaskId(albumId)
  const preMaskTaskId = (preMaskTask && preMaskTask.taskId) || ''
  const preMaskVersion = (preMaskTask && preMaskTask.preMaskVersion) || 0

  const existing = await prisma.desensitizeTask.findUnique({
    where: { taskId },
    include: { assets: true },
  })
  const existingIndex = indexAssetsByRawUrl(existing && existing.assets)
  // 重建任务时：已结算托管行优先保留，禁止预脱敏空行把成功结论冲掉
  let assetInputs = ((preMaskTask && preMaskTask.assets) || []).map((row) => {
    const mapped = mapPreMaskAssetToAuthorizeInput(row)
    const prev = lookupAssetByRawUrl(existingIndex, mapped.rawUrl)
    if (prev && assetMaskSettled(prev) && !assetMaskSettled(mapped)) {
      return {
        ...mapped,
        mediaId: prev.mediaId || mapped.mediaId || '',
        maskedUrl: prev.maskedUrl || prev.preMaskedUrl || '',
        preMaskedUrl: prev.preMaskedUrl || prev.maskedUrl || '',
        status: prev.status,
        riskTags: prev.riskTags || [],
        riskLevel: prev.riskLevel || '',
      }
    }
    return mapped
  })
  flowUrls.forEach((url) => {
    if (assetCoversUrl(assetInputs, url)) return
    const prev = lookupAssetByRawUrl(existingIndex, url)
    if (prev && assetMaskSettled(prev)) {
      assetInputs.push({
        assetId: prev.assetId || flowAssetId(url),
        mediaId: prev.mediaId || '',
        nodeId: prev.nodeId || 'flow',
        nodeTitle: prev.nodeTitle || '单据',
        idx: assetInputs.length,
        rawUrl: url,
        maskedUrl: prev.maskedUrl || prev.preMaskedUrl || '',
        preMaskedUrl: prev.preMaskedUrl || prev.maskedUrl || '',
        status: prev.status,
        previewed: false,
        riskTags: prev.riskTags || [],
        riskLevel: prev.riskLevel || '',
      })
      return
    }
    assetInputs.push({
      assetId: flowAssetId(url),
      mediaId: '',
      nodeId: 'flow',
      nodeTitle: '单据',
      idx: assetInputs.length,
      rawUrl: url,
      maskedUrl: '',
      preMaskedUrl: '',
      status: ASSET_STATUS.RAW_UPLOADED,
      previewed: false,
      riskTags: [],
      riskLevel: '',
    })
  })
  // 幽灵行清理：预脱敏任务里遗留的旧资产（URL 在当前节点图集合与 flow 图里都不存在）
  // 不再进托管任务 —— 它们重跑大模型也写不回节点，只会拖慢每次预览对账
  try {
    const { loadHostNodeImageUrlKeys } = require('./hosted-public-mask.service')
    const nodeUrlKeys = await loadHostNodeImageUrlKeys(album.id)
    if (nodeUrlKeys.size) {
      const { rawUrlLookupKeys } = require('../services/desensitize.constants')
      const flowKeySet = new Set()
      flowUrls.forEach((u) => rawUrlLookupKeys(u).forEach((k) => k && flowKeySet.add(k)))
      const keepAlive = (url) =>
        rawUrlLookupKeys(url).some((k) => nodeUrlKeys.has(k) || flowKeySet.has(k))
      const before = assetInputs.length
      assetInputs = assetInputs.filter((row) => keepAlive(String((row && row.rawUrl) || '').trim()))
      if (assetInputs.length !== before) {
        console.info('[ensureHostMask] pruned ghost assets', {
          albumId: album.id,
          before,
          after: assetInputs.length,
        })
      }
    }
  } catch (_) {
    /* 节点集合拿不到时不剪，保守 */
  }

  const missingFlow = flowUrls.filter((url) => !assetCoversUrl(existing && existing.assets, url))
  // 任务行无成功产物（无 maskedUrl）也视为未齐，避免早退漏打交车图
  const incompleteAssets = ((existing && existing.assets) || []).filter(
    (row) => !assetMaskSettled(row),
  )
  const sameVersion =
    existing &&
    String(existing.preMaskTaskId || '') === String(preMaskTaskId) &&
    Number(existing.preMaskVersion || 0) === Number(preMaskVersion) &&
    !existing.maskingConfirmed &&
    (existing.assets || []).length > 0

  // flow 齐套且行上都已结算 → 早退。force 只对账预脱敏，不得因 force 整本重建托管任务
  if (sameVersion && !missingFlow.length && !incompleteAssets.length) {
    await persistMaskedPairsToAlbumFlow(
      albumId,
      (existing.assets || [])
        .map((row) =>
          writebackPairFromMaskResult(row && row.rawUrl, {
            maskedUrl: row && (row.maskedUrl || row.preMaskedUrl),
            ok: assetMaskSettled(row),
            noSensitive:
              assetMaskSettled(row) &&
              !String((row && (row.maskedUrl || row.preMaskedUrl)) || '').trim(),
            riskTags: (row && row.riskTags) || [],
          }),
        )
        .filter(Boolean),
    )
    const task = await getTaskById(taskId)
    return {
      albumId,
      taskId,
      fromPreMask: Boolean(preMaskTaskId),
      preMaskStatus: (preMaskTask && preMaskTask.preMaskStatus) || '',
      assetCount: (task && task.rawAssets && task.rawAssets.length) || existing.assets.length,
      task,
    }
  }

  await prisma.desensitizeTask.upsert({
    where: { taskId },
    create: {
      taskId,
      bizType: BIZ_TYPE.MERCHANT_HISTORY,
      bizId: album.id,
      orderId: album.orderId || null,
      operatorRole: 'merchant',
      liabilityType: 'merchant',
      preMaskTaskId: preMaskTaskId || null,
      preMaskVersion,
      fromPreMask: Boolean(preMaskTaskId),
      maskingConfirmed: false,
      assets: { create: assetInputs },
    },
    update: {
      bizType: BIZ_TYPE.MERCHANT_HISTORY,
      bizId: album.id,
      orderId: album.orderId || null,
      operatorRole: 'merchant',
      liabilityType: 'merchant',
      preMaskTaskId: preMaskTaskId || null,
      preMaskVersion,
      fromPreMask: Boolean(preMaskTaskId),
      maskingConfirmed: false,
      maskingConfirmedAt: null,
      assets: {
        deleteMany: {},
        create: assetInputs,
      },
    },
  })

  await persistMaskedPairsToAlbumFlow(
    albumId,
    assetInputs
      .map((row) =>
        writebackPairFromMaskResult(row && row.rawUrl, {
          maskedUrl: row && row.maskedUrl,
          ok: Boolean(row && (row.maskedUrl || row.status === ASSET_STATUS.MASKED_READY)),
          noSensitive:
            row &&
            row.status === ASSET_STATUS.MASKED_READY &&
            !String(row.maskedUrl || '').trim() &&
            !(Array.isArray(row.riskTags) && row.riskTags.length),
          riskTags: (row && row.riskTags) || [],
        }),
      )
      .filter(Boolean),
  )

  const task = await getTaskById(taskId)
  return {
    albumId,
    taskId,
    fromPreMask: Boolean(preMaskTaskId),
    preMaskStatus: (preMaskTask && preMaskTask.preMaskStatus) || '',
    assetCount: (task && task.rawAssets && task.rawAssets.length) || assetInputs.length,
    task,
  }
}

module.exports = {
  loadAlbumWithRelations,
  albumToNodeView,
  getTaskById,
  canIncludePrivacyDetections,
  findPreMaskTask,
  ensureOrderPreMaskTask,
  scheduleAlbumPreMask,
  getAlbumPreMaskReadiness,
  buildPreMaskUrlLookup,
  resolveMaskedUrlForRaw,
  collectMaskedUrlsForRawList,
  createAlbumAuthorizeTaskFromPreMask,
  createOrderAuthorizeTaskFromPreMask,
  ensureHostMerchantMaskTask,
  runAutoMask,
  retryAsset,
  applyManualMask,
  markAssetPreviewed,
  excludeAuthorizeAsset,
  confirmOrderAuthorizeTask,
  confirmReviewImagePreviewTask,
  createReviewImagePreviewTask,
  persistMaskedPairsToAlbumFlow,
  createMerchantColdStartAuthorizeTaskFromPreMask,
}
