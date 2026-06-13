const { resolveImageSrcList } = require('./desensitize-url')
const { formatAlbumDateTime } = require('./service-album-display')

/**
 * 将六阶段节点扁平化为「翻页相册」页序列（每页一张大图 + 文案）。
 * @param {Array} nodes 相册节点（与详情 API `nodes` 同结构）
 * @returns {{ pages: object[], chapters: object[] }}
 */
function buildAlbumFlipPages(nodes = []) {
  const pages = []
  const chapters = []

  ;(nodes || []).forEach((node) => {
    const images = resolveImageSrcList(node.images || [])
    if (!images.length) return

    const nodeTitle = node.title || ''
    const note = node.note || ''
    const time = node.time || formatAlbumDateTime(node.updatedAt) || ''
    const startIndex = pages.length

    chapters.push({
      nodeId: node.id || '',
      title: nodeTitle,
      startIndex,
    })

    images.forEach((url, imageIndex) => {
      pages.push({
        type: 'photo',
        id: `${node.id || 'node'}_${imageIndex}`,
        url,
        imageUrl: url,
        nodeId: node.id || '',
        nodeTitle,
        note,
        caption: note,
        time,
        imageIndex,
        imageCountInNode: images.length,
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
}
