const { SERVICE_ALBUM_STAGES, getStageMeta } = require('../constants/service-album-stages')
const {
  filterEvidenceByStage,
  resolveProcessImagesForStage,
  normalizeImageList,
  isOldPartEvidenceItem,
} = require('./album-evidence-items')
const { resolveImageSrcList } = require('./desensitize-url')
const { formatAlbumDateTime } = require('./service-album-display')

function resolvePartLabel(part) {
  return String((part && (part.partName || part.name)) || '').trim() || '配件凭证'
}

function pushImageEntries(entries, urls, label, seen) {
  normalizeImageList(urls).forEach((url) => {
    if (seen.has(url)) return
    seen.add(url)
    entries.push({
      url,
      imageLabel: String(label || '').trim() || '照片',
    })
  })
}

function collectPartPhotoEntries(parts, seen) {
  const entries = []
  ;(parts || []).forEach((part) => {
    const label = resolvePartLabel(part)
    pushImageEntries(entries, part.photos, label, seen)
  })
  return entries
}

function collectStageImageEntries(stageId, node, evidenceItems, parts) {
  const stageMeta = getStageMeta(stageId)
  const nodeTitle = (node && node.title) || (stageMeta && stageMeta.title) || stageId
  const entries = []
  const seen = new Set()

  if (stageId === 'stage_3' || stageId === 'stage_5' || stageId === 'stage_6') {
    filterEvidenceByStage(evidenceItems, stageId).forEach((item) => {
      const label = String(item.label || '').trim() || nodeTitle
      pushImageEntries(entries, item.images, label, seen)
    })
  }

  if (stageId === 'stage_5') {
    ;(evidenceItems || []).filter(isOldPartEvidenceItem).forEach((item) => {
      const label = String(item.label || '').trim() || nodeTitle
      pushImageEntries(entries, item.images, label, seen)
    })
  }

  if (stageId === 'stage_4') {
    collectPartPhotoEntries(parts, seen).forEach((entry) => entries.push(entry))
  }

  let processUrls = []
  if (stageId === 'stage_3' || stageId === 'stage_5' || stageId === 'stage_6') {
    processUrls = resolveProcessImagesForStage(node, evidenceItems)
  } else if (stageId === 'stage_4') {
    const partUrlSet = new Set()
    ;(parts || []).forEach((part) => {
      normalizeImageList(part.photos).forEach((url) => partUrlSet.add(url))
    })
    processUrls = normalizeImageList(node && node.images).filter((url) => !partUrlSet.has(url))
  } else {
    processUrls = normalizeImageList(node && node.images)
  }

  pushImageEntries(entries, processUrls, nodeTitle, seen)
  return entries
}

/**
 * 将六阶段相册扁平化为「翻页相册」页序列（每页一张大图 + 文案）。
 * @param {Array|object} input 节点数组（兼容旧调用）或相册详情 { nodes, evidenceItems, parts }
 * @returns {{ pages: object[], chapters: object[] }}
 */
function buildAlbumFlipPages(input = []) {
  const detail = Array.isArray(input) ? { nodes: input } : input || {}
  const nodes = detail.nodes || []
  const evidenceItems = detail.evidenceItems || []
  const parts = detail.parts || []

  const nodeById = {}
  ;(nodes || []).forEach((node) => {
    const id = node && (node.id || node.nodeId)
    if (id) nodeById[id] = node
  })

  const pages = []
  const chapters = []

  SERVICE_ALBUM_STAGES.forEach((stage) => {
    const node =
      nodeById[stage.id] ||
      {
        id: stage.id,
        title: stage.title,
        images: [],
        note: '',
        updatedAt: '',
      }
    const rawEntries = collectStageImageEntries(stage.id, node, evidenceItems, parts)
    if (!rawEntries.length) return

    const nodeTitle = node.title || stage.title
    const note = node.note || ''
    const time = node.time || formatAlbumDateTime(node.updatedAt) || ''
    const startIndex = pages.length

    chapters.push({
      nodeId: stage.id,
      title: nodeTitle,
      startIndex,
      pageCount: rawEntries.length,
    })

    rawEntries.forEach((entry, imageIndex) => {
      const resolved = resolveImageSrcList([entry.url])
      const url = resolved[0] || entry.url
      pages.push({
        type: 'photo',
        id: `${stage.id}_${startIndex + imageIndex}`,
        url,
        imageUrl: url,
        nodeId: stage.id,
        nodeTitle,
        imageLabel: entry.imageLabel || nodeTitle,
        note,
        caption: note,
        time,
        imageIndex,
        imageCountInNode: rawEntries.length,
      })
    })
  })

  return { pages, chapters }
}

/**
 * 信息抽屉用：有 note 的节点 + 首图缩略图。
 * @param {Array} nodes
 * @returns {Array<{ nodeId, nodeTitle, thumbUrl, note }>}
 */
function buildAlbumNodeNotes(nodes = []) {
  const list = []
  ;(nodes || []).forEach((node) => {
    const note = String(node.note || '').trim()
    if (!note) return
    const images = resolveImageSrcList(node.images || [])
    list.push({
      nodeId: node.id || '',
      nodeTitle: node.title || '',
      thumbUrl: images[0] || '',
      note,
    })
  })
  return list
}

module.exports = {
  buildAlbumFlipPages,
  buildAlbumNodeNotes,
  collectStageImageEntries,
}
