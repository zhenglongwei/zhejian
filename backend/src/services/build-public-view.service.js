/**
 * PV-REFORM · PublicView 构建（公开池 media + scrub 文案）
 */
const { resolvePublicCaseMediaUrl } = require('../lib/media-url')
const { stripUrlQuery } = require('../lib/media-signed-url')
const { rewriteMediaUrlForCurrentBase } = require('../lib/media-storage')
const { scrubPiiText } = require('../utils/scrub-pii-text')
const { extractGeoFromAlbumNodes, findStageNode } = require('../utils/album-geo-extract')
const {
  PUBLIC_MEDIA_SOFT_CAP,
  PUBLIC_MEDIA_KEYFRAME_DEFAULT,
  PUBLIC_GATE_STATUS,
  VISIBILITY,
} = require('../constants/album-public-visibility-policy')

function normalizeImageUrl(url = '') {
  return stripUrlQuery(rewriteMediaUrlForCurrentBase(String(url || '').trim()))
}

function taskAssets(task) {
  if (!task) return []
  return task.rawAssets || task.assets || []
}

function resolveMaskedUrlForImage(task, nodeId, idx, rawUrl) {
  const assets = taskAssets(task)
  const normalized = normalizeImageUrl(rawUrl)
  let matched = assets.find(
    (asset) =>
      String(asset.nodeId || '') === String(nodeId) &&
      Number(asset.idx != null ? asset.idx : asset.index ?? 0) === Number(idx),
  )
  if (!matched && normalized) {
    matched = assets.find(
      (asset) => normalizeImageUrl(asset.rawUrl || asset.url || '') === normalized,
    )
  }
  const masked = matched?.maskedUrl || matched?.preMaskedUrl || ''
  return resolvePublicCaseMediaUrl(masked)
}

function buildPublicRepairPlan(albumView = {}) {
  const nodes = albumView.nodes || []
  const stage3 = findStageNode(nodes, 'stage_3')
  const note = scrubPiiText(stage3?.note || '')
  const parts = (albumView.planParts || [])
    .map((row) => {
      const name = scrubPiiText(row.name || '')
      if (!name) return ''
      const type = scrubPiiText(row.partType || '')
      return type ? `${name}（${type}）` : name
    })
    .filter(Boolean)
  const chunks = []
  if (note) chunks.push(note)
  if (parts.length) chunks.push(`主要项目：${parts.join('、')}`)
  // PKG-COACH：公域藏价，不把 planAmount 写入公开方案文案
  return chunks.join('。').slice(0, 400)
}

function listPublicImageRows(albumView = {}) {
  const meta = Array.isArray(albumView.imageMeta) ? albumView.imageMeta : []
  return meta
    .filter(
      (row) =>
        row.visibility === VISIBILITY.PUBLIC &&
        row.publicGateStatus === PUBLIC_GATE_STATUS.PASSED,
    )
    .sort((a, b) => {
      const nodeCmp = String(a.nodeId).localeCompare(String(b.nodeId))
      if (nodeCmp !== 0) return nodeCmp
      return Number(a.idx || 0) - Number(b.idx || 0)
    })
}

function captionForNode(nodes, nodeId) {
  const node = findStageNode(nodes, nodeId)
  return scrubPiiText(node?.note || '').slice(0, 48)
}

/**
 * @param {object} albumView buildAlbumView 产物（含 imageMeta）
 * @param {object|null} task pre-mask / authorize task
 * @param {{ authorizationTier?: string, softCap?: number }} [options]
 */
function buildPublicView(albumView = {}, task = null, options = {}) {
  const nodes = albumView.nodes || []
  const softCap =
    options.softCap != null ? options.softCap : PUBLIC_MEDIA_KEYFRAME_DEFAULT
  const publicRows = listPublicImageRows(albumView).slice(
    0,
    Math.min(softCap, PUBLIC_MEDIA_SOFT_CAP),
  )

  const media = publicRows
    .map((row) => {
      const maskedUrl = resolveMaskedUrlForImage(task, row.nodeId, row.idx, row.rawUrl)
      if (!maskedUrl) return null
      return {
        nodeId: row.nodeId,
        idx: row.idx,
        maskedUrl,
        caption: captionForNode(nodes, row.nodeId),
      }
    })
    .filter(Boolean)

  const geo = extractGeoFromAlbumNodes(nodes, {
    coldStart: false,
    serviceName: albumView.serviceName,
    includePlanAmount: false,
    storeNote: albumView.storeNote,
  })

  const facts = {
    faultDesc: scrubPiiText(geo.faultDesc || '').slice(0, 200),
    inspectResult: scrubPiiText(geo.inspectResult || '').slice(0, 300),
    repairPlan: buildPublicRepairPlan(albumView),
    resultConfirm: scrubPiiText(geo.resultConfirm || '').slice(0, 200),
  }

  return {
    version: 1,
    authorizationTier: options.authorizationTier || 'named',
    storeName: scrubPiiText(albumView.store?.name || ''),
    storeId: albumView.store?.id || '',
    serviceName: albumView.serviceName || '',
    city: albumView.store?.city || '',
    media,
    facts,
    publicMediaCount: media.length,
    hasRepairPlanText: Boolean(facts.repairPlan),
  }
}

function publicViewToSnapshotNodes(publicView = {}, fallbackNodes = []) {
  const media = Array.isArray(publicView.media) ? publicView.media : []
  if (!media.length) {
    return (fallbackNodes || []).map((node) => ({ ...node, images: [] }))
  }

  const byNode = {}
  media.forEach((item) => {
    const nodeId = item.nodeId || ''
    if (!byNode[nodeId]) byNode[nodeId] = []
    byNode[nodeId].push(item.maskedUrl)
  })

  const titleByNode = {}
  ;(fallbackNodes || []).forEach((node) => {
    titleByNode[node.id || node.nodeId] = node.title || ''
  })

  return Object.keys(byNode).map((nodeId) => {
    const fallback = findStageNode(fallbackNodes, nodeId)
    return {
      id: nodeId,
      nodeId,
      title: fallback?.title || titleByNode[nodeId] || '',
      note: scrubPiiText(fallback?.note || '').slice(0, 500),
      images: byNode[nodeId].filter(Boolean),
    }
  })
}

function pickPublicViewCover(publicView = {}) {
  const media = Array.isArray(publicView.media) ? publicView.media : []
  for (let i = media.length - 1; i >= 0; i -= 1) {
    const url = resolvePublicCaseMediaUrl(media[i].maskedUrl || '')
    if (url) return url
  }
  for (const item of media) {
    const url = resolvePublicCaseMediaUrl(item.maskedUrl || '')
    if (url) return url
  }
  return ''
}

module.exports = {
  buildPublicView,
  buildPublicRepairPlan,
  publicViewToSnapshotNodes,
  pickPublicViewCover,
  listPublicImageRows,
}
