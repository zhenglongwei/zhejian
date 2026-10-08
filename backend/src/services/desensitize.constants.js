const { config } = require('../config')
const { rewriteMediaUrlForCurrentBase } = require('../lib/media-storage')
const { stripUrlQuery } = require('../lib/media-signed-url')

/** 指纹用稳定 URL（去掉 signed query），避免授权时误判过期重跑 OCR */
function stableMediaUrlForFingerprint(url) {
  return stripUrlQuery(rewriteMediaUrlForCurrentBase(url) || url || '')
}

const BIZ_TYPE = {
  ORDER_PRE_MASK: 'order_pre_mask',
  SERVICE_PRE_MASK: 'service_pre_mask',
  ORDER_AUTHORIZE: 'order_authorize',
  SERVICE_AUTHORIZE: 'service_authorize',
  SERVICE_REVIEW_PREVIEW: 'service_review_preview',
  MERCHANT_HISTORY: 'merchant_history',
}

const PRE_MASK_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  READY: 'ready',
  PARTIAL_FAILED: 'partial_failed',
  FAILED: 'failed',
}

const ASSET_STATUS = {
  RAW_UPLOADED: 'raw_uploaded',
  MASKING: 'masking',
  MASKED_READY: 'masked_ready',
  MASK_FAILED: 'mask_failed',
  MANUAL_MASKED: 'manual_masked',
  CONFIRMED: 'confirmed',
}

function buildDesensitizedUrl(rawUrl, albumId, nodeId, index) {
  if (!rawUrl) return ''
  const base = config.publicBaseUrl
  return `${base}/media/desensitized/${albumId}/${nodeId}/${index}`
}

function nodesFingerprint(nodes) {
  return JSON.stringify(
    (nodes || []).map((n) => ({
      id: n.nodeId || n.id,
      images: (n.images || []).map((img) => {
        const raw = typeof img === 'string' ? img : img.rawUrl || img.url
        return stableMediaUrlForFingerprint(raw)
      }),
    }))
  )
}

function fingerprintCacheVersion(fingerprint) {
  const text = String(fingerprint || '')
  const at = text.lastIndexOf('@')
  return at >= 0 ? text.slice(at + 1) : ''
}

function rawUrlLookupKeys(url) {
  const raw = String(url || '').trim()
  if (!raw) return []
  const keys = [raw, stripUrlQuery(raw)]
  try {
    const rewritten = rewriteMediaUrlForCurrentBase(raw)
    if (rewritten) {
      keys.push(rewritten, stripUrlQuery(rewritten))
    }
  } catch (_) {
    /* ignore */
  }
  return [...new Set(keys.filter(Boolean))]
}

function indexAssetsByRawUrl(assets = []) {
  const map = new Map()
  ;(assets || []).forEach((asset) => {
    rawUrlLookupKeys(asset.rawUrl || asset.url).forEach((key) => {
      map.set(key, asset)
    })
  })
  return map
}

function lookupAssetByRawUrl(index, url) {
  if (!index) return null
  for (const key of rawUrlLookupKeys(url)) {
    if (index.has(key)) return index.get(key)
  }
  return null
}

function hasReusableMask(asset) {
  if (!asset) return false
  const masked = String(asset.maskedUrl || asset.preMaskedUrl || '').trim()
  if (!masked) return false
  const status = asset.status
  if (
    status &&
    ![ASSET_STATUS.MASKED_READY, ASSET_STATUS.MANUAL_MASKED, ASSET_STATUS.CONFIRMED].includes(
      status,
    )
  ) {
    return false
  }
  return true
}

/** 已打码成功的图默认复用；假打码或运营对失败图重试才再打。 */
function shouldReuseMaskedAsset(prev, options = {}) {
  if (!hasReusableMask(prev)) return false
  if (options.albumForce) return false
  if (options.stub) return false
  return true
}

function listUnmaskedAlbumAssets(currentAssets, taskAssets) {
  const index = indexAssetsByRawUrl(taskAssets)
  return (currentAssets || []).filter(
    (asset) => !hasReusableMask(lookupAssetByRawUrl(index, asset.rawUrl)),
  )
}

function collectAssetsFromAlbum(album) {
  const assets = []
  ;(album.nodes || []).forEach((node) => {
    const images = node.images || []
    images.forEach((img, index) => {
      const rawUrl = typeof img === 'string' ? img : img.rawUrl || img.url
      if (!rawUrl) return
      assets.push({
        assetId: `${node.nodeId}_${index}`,
        nodeId: node.nodeId,
        nodeTitle: node.title,
        idx: index,
        rawUrl,
      })
    })
  })
  return assets
}

function resolvePreMaskStatus(assets) {
  if (!assets.length) return PRE_MASK_STATUS.READY
  const failed = assets.filter((a) => a.status === ASSET_STATUS.MASK_FAILED).length
  if (failed === assets.length) return PRE_MASK_STATUS.FAILED
  if (failed > 0) return PRE_MASK_STATUS.PARTIAL_FAILED
  return PRE_MASK_STATUS.READY
}

function mapTaskRecord(task) {
  if (!task) return null
  const rawAssets = (task.assets || []).map((asset) => ({
    id: asset.assetId,
    mediaId: asset.mediaId || '',
    nodeId: asset.nodeId,
    nodeTitle: asset.nodeTitle,
    index: asset.idx,
    idx: asset.idx,
    url: asset.rawUrl,
    rawUrl: asset.rawUrl,
    maskedUrl: asset.maskedUrl || '',
    preMaskedUrl: asset.preMaskedUrl || '',
    status: asset.status,
    previewed: asset.previewed,
    riskTags: asset.riskTags || [],
    riskLevel: asset.riskLevel || '',
  }))
  const maskedAssets = rawAssets
    .filter((a) => a.maskedUrl || a.preMaskedUrl)
    .map((a) => ({
      id: `m_${a.id}`,
      rawId: a.id,
      url: a.maskedUrl || a.preMaskedUrl,
      status: a.status,
    }))
  return {
    taskId: task.taskId,
    bizType: task.bizType,
    bizId: task.bizId,
    orderId: task.orderId || '',
    operatorRole: task.operatorRole,
    liabilityType: task.liabilityType,
    preMaskStatus: task.preMaskStatus || '',
    preMaskVersion: task.preMaskVersion || 0,
    preMaskTaskId: task.preMaskTaskId || '',
    fingerprint: task.fingerprint || '',
    fromPreMask: Boolean(task.fromPreMask),
    maskingConfirmed: task.maskingConfirmed,
    maskingConfirmedAt: task.maskingConfirmedAt
      ? new Date(task.maskingConfirmedAt).getTime()
      : null,
    preMaskedAt: task.preMaskedAt ? task.preMaskedAt.toISOString() : null,
    rawAssets,
    maskedAssets,
    updatedAt: task.updatedAt ? new Date(task.updatedAt).getTime() : Date.now(),
  }
}

function buildPreMaskTaskId(albumId) {
  return `task_premask_${albumId}`
}

function buildAuthorizeTaskId(albumId) {
  return `task_auth_${albumId}`
}

function buildMerchantColdStartTaskId(albumId) {
  return `task_mch_${albumId}`
}

/** 托管公开核对：商家可编辑的脱敏任务（非系统 pre_mask） */
function buildHostMaskTaskId(albumId) {
  return `task_host_mask_${albumId}`
}

function buildReviewPreviewTaskId(reviewId) {
  return `task_review_preview_${reviewId}`
}

function albumToNodeView(album) {
  const { excludeLibraryNodes, isLibraryNodeId } = require('../constants/album-media-library')
  const imagesByNode = {}
  ;(album.images || []).forEach((img) => {
    if (isLibraryNodeId(img.nodeId)) return
    if (!imagesByNode[img.nodeId]) imagesByNode[img.nodeId] = []
    imagesByNode[img.nodeId].push({
      id: img.id,
      url: rewriteMediaUrlForCurrentBase(img.rawUrl),
      caption: String(img.caption || ''),
      checklistItemKey: String(img.checklistItemKey || ''),
    })
  })
  return excludeLibraryNodes(album.nodes || []).map((node) => ({
    nodeId: node.nodeId,
    id: node.nodeId,
    title: node.title,
    status: node.status,
    note: node.note || '',
    comparePairRows: (Array.isArray(node.comparePairRows) ? node.comparePairRows : []).map((row) => ({
      before: row.before ? rewriteMediaUrlForCurrentBase(String(row.before)) : '',
      after: row.after ? rewriteMediaUrlForCurrentBase(String(row.after)) : '',
    })),
    images: imagesByNode[node.nodeId] || [],
  }))
}

module.exports = {
  BIZ_TYPE,
  PRE_MASK_STATUS,
  ASSET_STATUS,
  buildDesensitizedUrl,
  nodesFingerprint,
  fingerprintCacheVersion,
  rawUrlLookupKeys,
  indexAssetsByRawUrl,
  lookupAssetByRawUrl,
  hasReusableMask,
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
}
