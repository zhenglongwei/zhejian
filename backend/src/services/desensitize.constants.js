const { config } = require('../config')

const BIZ_TYPE = {
  ORDER_PRE_MASK: 'order_pre_mask',
  SERVICE_PRE_MASK: 'service_pre_mask',
  ORDER_AUTHORIZE: 'order_authorize',
  SERVICE_AUTHORIZE: 'service_authorize',
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
      images: (n.images || []).map((img) => (typeof img === 'string' ? img : img.rawUrl || img.url)),
    }))
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
  if (!assets.length) return PRE_MASK_STATUS.FAILED
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

function albumToNodeView(album) {
  const imagesByNode = {}
  ;(album.images || []).forEach((img) => {
    if (!imagesByNode[img.nodeId]) imagesByNode[img.nodeId] = []
    imagesByNode[img.nodeId].push(img.rawUrl)
  })
  return (album.nodes || []).map((node) => ({
    nodeId: node.nodeId,
    id: node.nodeId,
    title: node.title,
    status: node.status,
    note: node.note || '',
    images: imagesByNode[node.nodeId] || [],
  }))
}

module.exports = {
  BIZ_TYPE,
  PRE_MASK_STATUS,
  ASSET_STATUS,
  buildDesensitizedUrl,
  nodesFingerprint,
  collectAssetsFromAlbum,
  resolvePreMaskStatus,
  mapTaskRecord,
  buildPreMaskTaskId,
  buildAuthorizeTaskId,
  albumToNodeView,
}
