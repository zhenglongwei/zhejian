/**
 * 可公示过程图：只认流程节点挂图（DOC-FLOW）。
 * 废止 album_images.visibility / publicGate* 作硬拦真源。
 * 真源：15_ §公开前打码 · skill_node_mask_state_machine
 */
const { collectBagImageRefs } = require('./flow-photo-mask-writeback')
const { VISIBILITY, PUBLIC_GATE_STATUS } = require('../constants/album-public-visibility-policy')
const { stripUrlQuery } = require('../lib/media-signed-url')

/** 接车 / 报价图仅留档，不上网（对标旧 always_private） */
const PRIVATE_FLOW_KINDS = new Set([
  'intake',
  'intake_inspection',
  'quote_confirm',
])

function flowNodesOf(album) {
  const pkg =
    album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  return Array.isArray(pkg.flowNodes) ? pkg.flowNodes : []
}

function albumUsesFlowNodes(album) {
  return flowNodesOf(album).length > 0
}

/**
 * 可上网过程图清单（检测 / 施工 / 交车等；接车与报价排除）。
 * 有 URL 即计入「有可公示素材」；打码结论另按节点状态机选展示图。
 */
function collectPublicizableFlowPhotos(album) {
  const out = []
  const seen = new Set()
  flowNodesOf(album).forEach((node) => {
    if (!node || typeof node !== 'object') return
    const kind = String(node.kind || '').trim()
    if (PRIVATE_FLOW_KINDS.has(kind)) return
    const refs = []
    collectBagImageRefs(node.content, refs)
    collectBagImageRefs(node.photoDraft, refs)
    const payload = node.document && node.document.payload
    collectBagImageRefs(payload, refs)
    refs.forEach((ref) => {
      const url = String((ref && ref.url) || '').trim()
      // 同一张照片在节点各袋里可能带不同签名参数；按去查询串后的真源去重
      const key = stripUrlQuery(url)
      if (!url || !key || seen.has(key)) return
      seen.add(key)
      out.push({
        nodeId: String(node.id || node.nodeId || kind || ''),
        kind,
        url,
        maskedUrl: String((ref && ref.maskedUrl) || '').trim(),
        maskOutcome: String((ref && ref.maskOutcome) || '').trim(),
      })
    })
  })
  return out
}

function countPublicizableFlowPhotos(album) {
  return collectPublicizableFlowPhotos(album).length
}

/**
 * 给 assessPublicCaseQuality / buildPublicView 用的 imageMeta 形状。
 * 有可公示节点图 → 标 public+passed（不再读 album_images 闸）。
 */
function mapFlowImageMeta(album) {
  return collectPublicizableFlowPhotos(album).map((row, idx) => ({
    id: `flow_${row.nodeId}_${idx}`,
    nodeId: row.nodeId,
    idx,
    rawUrl: row.url,
    caption: '',
    checklistItemKey: '',
    visibility: VISIBILITY.PUBLIC,
    publicGateStatus: PUBLIC_GATE_STATUS.PASSED,
    publicGateReason: '',
    publicGateCheckedAt: '',
    maskedUrl: row.maskedUrl,
    maskOutcome: row.maskOutcome,
  }))
}

module.exports = {
  PRIVATE_FLOW_KINDS,
  flowNodesOf,
  albumUsesFlowNodes,
  collectPublicizableFlowPhotos,
  countPublicizableFlowPhotos,
  mapFlowImageMeta,
}
