/**
 * 商家保存相册时检测是否应通知车主 — B-ALB-10
 */

const { SERVICE_ALBUM_STATUS } = require('../constants/v2')

const DONE_STATUSES = new Set([
  SERVICE_ALBUM_STATUS.COMPLETED,
  SERVICE_ALBUM_STATUS.PUBLISHED,
  'completed',
  'published',
])

function countImagesByNodeId(album, nodeId) {
  return (album.images || []).filter((img) => img && img.nodeId === nodeId).length
}

function findImageChangedStageTitle(existing, nodesPayload) {
  if (!Array.isArray(nodesPayload)) return ''
  for (let i = 0; i < nodesPayload.length; i += 1) {
    const node = nodesPayload[i]
    const nodeId = node && (node.id || node.nodeId)
    if (!nodeId) continue
    const oldCount = countImagesByNodeId(existing, nodeId)
    const newCount = (node.images || []).length
    if (newCount > oldCount) {
      return String(node.title || '').trim()
    }
  }
  return ''
}

function findNoteChangedStageTitle(existing, nodesPayload) {
  if (!Array.isArray(nodesPayload)) return ''
  const oldNotes = {}
  ;(existing.nodes || []).forEach((node) => {
    if (node && node.nodeId) {
      oldNotes[node.nodeId] = String(node.note || '').trim()
    }
  })
  for (let i = 0; i < nodesPayload.length; i += 1) {
    const node = nodesPayload[i]
    const nodeId = node && (node.id || node.nodeId)
    if (!nodeId) continue
    const nextNote = String(node.note || '').trim()
    const prevNote = oldNotes[nodeId] || ''
    if (nextNote && nextNote !== prevNote) {
      return String(node.title || '').trim()
    }
  }
  return ''
}

/**
 * @returns {{ kind: 'images'|'note', stageTitle: string } | null}
 */
function detectAlbumSaveChanges(existing, payload = {}, newImageCount) {
  if (!existing || DONE_STATUSES.has(existing.status)) return null
  if (!Array.isArray(payload.nodes)) return null

  const prevCount = Number(existing.imageCount) || 0
  const nextCount = Number(newImageCount) || 0
  if (nextCount > prevCount) {
    return {
      kind: 'images',
      stageTitle: findImageChangedStageTitle(existing, payload.nodes) || '施工进度',
    }
  }

  const stageTitle = findNoteChangedStageTitle(existing, payload.nodes)
  if (stageTitle) {
    return { kind: 'note', stageTitle }
  }
  return null
}

module.exports = {
  detectAlbumSaveChanges,
}
