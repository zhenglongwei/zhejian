/**
 * 可公示过程图：只认流程节点挂图（DOC-FLOW）。
 * 废止 album_images.visibility / publicGate* 作硬拦真源。
 * 真源：15_ §公开前打码 · skill_node_mask_state_machine
 */
const { collectBagImageRefs } = require('./flow-photo-mask-writeback')
const { VISIBILITY, PUBLIC_GATE_STATUS } = require('../constants/album-public-visibility-policy')
const { stripUrlQuery } = require('../lib/media-signed-url')
const {
  DELIVERY_PHOTO_ROLE,
  collectDeliveryEntryPhotos,
  deliveryPhotoRoleMap,
  readHostDeliveryPhotoRoles,
} = require('./host-delivery-photo-roles')

/**
 * 整节点图片不上网：只留档。
 * - 接车 / 接车检测：留证照片不公开
 * - 报价：报价单本体不公开（项目行文字另走 buildFlowNodeViews，仍可上网）
 * - 交车：只有一个整车照上传入口，外观照不公开；托管生成时被模型判为
 *   施工证据的图（门店常把验收照片补传到这里）按过程图公开。
 * 补充报价 / 补充施工按过程图公开（见 isAddonNode）。
 */
const PRIVATE_FLOW_KINDS = new Set([
  'intake',
  'intake_inspection',
  'quote_confirm',
  'delivery_photos',
  'repair_report',
])

/** 交车节点里被模型判为施工证据的照片（见 host-delivery-photo-roles.js） */
function deliveryWorkPhotos(album, node) {
  const roles = readHostDeliveryPhotoRoles(album)
  if (!roles.length) return []
  const roleMap = deliveryPhotoRoleMap(roles)
  if (!roleMap.size) return []
  return collectDeliveryEntryPhotos([node]).filter((slot) => {
    const hit = roleMap.get(
      stripUrlQuery(String((slot && (slot.url || slot.rawUrl)) || '').trim()),
    )
    return Boolean(hit && hit.role === DELIVERY_PHOTO_ROLE.WORK)
  })
}

/** 补充报价虽沿用 quote_confirm，但属于过程节点，图上公开 */
function isAddonNode(node) {
  return Boolean(
    node &&
      ((node.kind === 'quote_confirm' && String(node.insertedReason || '') === 'addon') ||
        node.kind === 'addon_quote_confirm' ||
        (node.kind === 'work' && String(node.insertedReason || '') === 'addon')),
  )
}

function flowNodesOf(album) {
  const pkg =
    album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  const nodes = Array.isArray(pkg.flowNodes) ? pkg.flowNodes : []
  // 案例快照/公开页严格按节点发生顺序展示
  return nodes
    .slice()
    .sort((a, b) => Number((a && a.sortOrder) || 0) - Number((b && b.sortOrder) || 0))
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
  const pushRefs = (node, kind, bag) => {
    const refs = []
    collectBagImageRefs(bag, refs)
    refs.forEach((ref) => {
      const url = String((ref && ref.url) || '').trim()
      // 大模型判为疑似纸质单据：商家未确认前不进公域
      if (ref && ref.docLike === true && ref.docConfirmed !== true) return
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
  }
  flowNodesOf(album).forEach((node) => {
    if (!node || typeof node !== 'object') return
    const kind = String(node.kind || '').trim()
    if (PRIVATE_FLOW_KINDS.has(kind) && !isAddonNode(node)) {
      // 交车节点只放行模型判为施工证据的图；整车外观照仍留档
      const workPhotos = deliveryWorkPhotos(album, node)
      if (!workPhotos.length) return
      pushRefs(node, kind, { photos: workPhotos })
      return
    }
    pushRefs(node, kind, node.content)
  })
  return out
}

function countPublicizableFlowPhotos(album) {
  return collectPublicizableFlowPhotos(album).length
}

function collectAllFlowPhotos(album) {
  const out = []
  const seen = new Set()
  flowNodesOf(album).forEach((node) => {
    if (!node || typeof node !== 'object') return
    const refs = []
    collectBagImageRefs(node.content, refs)
    refs.forEach((ref) => {
      const url = String((ref && ref.url) || '').trim()
      const key = stripUrlQuery(url)
      if (!url || !key || seen.has(key)) return
      seen.add(key)
      out.push({ nodeId: String(node.id || node.nodeId || ''), url })
    })
  })
  return out
}

function countAllFlowPhotos(album) {
  return collectAllFlowPhotos(album).length
}

/**
 * 流程相册的节点视图：与 imageMeta（流程真源）同一套 nodeId，供案例快照/公开页取标题与说明。
 * 图片不在这里挂，统一由 publicView（已过公开闸）按 nodeId 输出，避免接车/报价图外泄。
 */
function buildFlowNodeViews(album) {
  return flowNodesOf(album).map((node, idx) => {
    const kind = String((node && node.kind) || '').trim()
    const content =
      node && node.content && typeof node.content === 'object' && Object.keys(node.content).length
        ? node.content
        : {}
    const note = String((node && node.note) || '').trim()
    return {
      id: String((node && (node.id || node.nodeId)) || `flow_${idx}`),
      nodeId: String((node && (node.id || node.nodeId)) || `flow_${idx}`),
      title: String((node && node.title) || '').trim(),
      kind,
      status: String((node && node.status) || 'pending'),
      note:
        note ||
        String(content.conclusion || '').trim() ||
        String((content.discovery && content.discovery.note) || '').trim(),
      content,
      document: node && node.document ? node.document : null,
      images: [],
    }
  })
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
  collectAllFlowPhotos,
  countAllFlowPhotos,
  buildFlowNodeViews,
  mapFlowImageMeta,
}
