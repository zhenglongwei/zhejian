/**
 * 旧相册阶段的图并进对应节点一次。
 * 真源：docs/04_维修过程相册/26_商家端事件节点与单据节点链流程.md
 * 接车 / 检测 / 工单只认节点草稿里的图。不把散图变成检测项或施工项。
 */

const FOLD_KINDS = {
  intake: ['stage_1'],
  inspection: ['stage_2'],
  work: ['stage_5'],
  intake_inspection: ['stage_1', 'stage_2'],
}

function photoKey(url) {
  return String(url || '').trim().replace(/[?#].*$/, '')
}

function imageUrl(raw) {
  if (typeof raw === 'string') return String(raw || '').trim()
  return String((raw && (raw.url || raw.rawUrl)) || '').trim()
}

function stageIdsFor(node) {
  if (!node || !FOLD_KINDS[node.kind]) return []
  if (Array.isArray(node.legacyStageIds) && node.legacyStageIds.length) return node.legacyStageIds
  if (node.legacyStageId) return [node.legacyStageId]
  return FOLD_KINDS[node.kind]
}

function ownedKeys(node) {
  const draft = (node && node.photoDraft) || {}
  const keys = {}
  const mark = (raw) => {
    const key = photoKey(imageUrl(raw))
    if (key) keys[key] = true
  }
  mark(draft.odometerUrl)
  mark(draft.deliveryExteriorUrl)
  ;(Array.isArray(draft.selectedDeliveryUrls) ? draft.selectedDeliveryUrls : []).forEach(mark)
  ;(Array.isArray(draft.pendingImages) ? draft.pendingImages : []).forEach(mark)
  ;(Array.isArray(draft.findings) ? draft.findings : []).forEach((item) => {
    const shots =
      item && Array.isArray(item.images) && item.images.length
        ? item.images
        : item && item.url
          ? [item]
          : []
    shots.forEach(mark)
  })
  ;(Array.isArray(draft.intakeResults) ? draft.intakeResults : []).forEach((item) => {
    ;(item && Array.isArray(item.images) ? item.images : []).forEach(mark)
  })
  return keys
}

function stageImages(node, albumNodes) {
  const out = []
  stageIdsFor(node).forEach((stageId) => {
    const stage = (albumNodes || []).find((item) => item && item.id === stageId)
    ;(stage && Array.isArray(stage.images) ? stage.images : []).forEach((img) => {
      const url = imageUrl(img)
      if (!url) return
      out.push({
        url,
        imageId: String((img && (img.imageId || img.id)) || ''),
        caption: String((img && img.caption) || ''),
      })
    })
  })
  return out
}

/**
 * 把旧阶段里、节点上还没有的图补进 pendingImages。
 * 没有要补的返回 null。不改 findings。
 */
function planLegacyPhotoFold(flowNodes, albumNodes) {
  const list = Array.isArray(flowNodes) ? flowNodes : []
  let changed = false
  const next = list.map((node) => {
    if (!node || !FOLD_KINDS[node.kind]) return node
    const owned = ownedKeys(node)
    const extra = []
    stageImages(node, albumNodes).forEach((img) => {
      const key = photoKey(img.url)
      if (!key || owned[key]) return
      owned[key] = true
      extra.push(img)
    })
    if (!extra.length) return node
    changed = true
    const draft = (node.photoDraft && typeof node.photoDraft === 'object' && node.photoDraft) || {}
    const pending = Array.isArray(draft.pendingImages) ? draft.pendingImages.slice() : []
    return {
      ...node,
      photoDraft: {
        ...draft,
        pendingImages: pending.concat(extra),
      },
    }
  })
  return changed ? next : null
}

module.exports = {
  planLegacyPhotoFold,
  photoKey,
}
