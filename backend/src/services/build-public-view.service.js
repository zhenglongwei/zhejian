/**
 * PV-REFORM · PublicView 构建（公开池 media + scrub 文案）
 */
const { resolvePublicCaseMediaUrl, resolveStoreProcessedPublicUrl } = require('../lib/media-url')
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
 * @param {{ authorizationTier?: string, softCap?: number, allowStoreProcessedFace?: boolean }} [options]
 *        allowStoreProcessedFace 已废弃（保留参数兼容旧调用）：新政策下隐私责任在商家，
 *        平台只做必要技术脱敏，不强制拦截原图——有码用码，无产物放行持久化原图。
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
      // 节点写回的打码结论优先（DOC-FLOW 真源）；task 资产仅作旧数据兜底
      const nodeMasked = resolvePublicCaseMediaUrl(row.maskedUrl || '')
      const toolMasked = nodeMasked
        ? ''
        : resolveMaskedUrlForImage(task, row.nodeId, row.idx, row.rawUrl)
      // 无打码产物时不再丢弃图片：放行持久化原图（责任在商家）
      const maskedUrl =
        nodeMasked || toolMasked || resolveStoreProcessedPublicUrl(row.rawUrl || '')
      if (!maskedUrl) return null
      return {
        nodeId: row.nodeId,
        idx: row.idx,
        maskedUrl,
        caption: captionForNode(nodes, row.nodeId),
        storeProcessed: !nodeMasked && !toolMasked,
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
  const pick = (item) => {
    const url = String((item && item.maskedUrl) || '').trim()
    if (!url) return ''
    // 打码产物优先；无产物时允许持久化原图（责任在商家）
    return resolvePublicCaseMediaUrl(url) || resolveStoreProcessedPublicUrl(url)
  }
  for (let i = media.length - 1; i >= 0; i -= 1) {
    const url = pick(media[i])
    if (url) return url
  }
  for (const item of media) {
    const url = pick(item)
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
