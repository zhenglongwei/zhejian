/**
 * MOCK — 脱敏占位（联调后由服务端返回 desensitizedUrl）
 * 公开展示仅使用 imagesDesensitized / coverImageDesensitized，禁止写入 tempFilePath 原图。
 */
const {
  isDesensitizedUrl,
  buildDesensitizedUrl,
  resolveMediaUrl,
  resolveImageSrc,
  resolveImageSrcList,
} = require('./desensitize-url')

function mockDesensitizedUrl(rawUrl, albumId, nodeId, index) {
  return buildDesensitizedUrl(rawUrl, albumId, nodeId, index)
}

/**
 * 为节点补充 imagesDesensitized（保留 images 作商家端原图）
 * @param {Array} nodes
 * @param {string} albumId
 */
function applyMockDesensitizeToNodes(nodes, albumId) {
  return (nodes || []).map((node) => {
    const raw = node.images || []
    const imagesDesensitized = raw.map((url, index) =>
      mockDesensitizedUrl(url, albumId, node.id || 'node', index)
    )
    return {
      ...node,
      images: raw,
      imagesDesensitized,
    }
  })
}

function pickRawCover(nodes) {
  for (let i = 0; i < (nodes || []).length; i += 1) {
    const imgs = nodes[i].images || []
    if (imgs.length) return imgs[0]
  }
  return ''
}

function pickDesensitizedCover(nodes) {
  for (let i = 0; i < (nodes || []).length; i += 1) {
    const imgs = nodes[i].imagesDesensitized || []
    if (imgs.length) return imgs[0]
  }
  return ''
}

/** 用户端/API 对外节点：仅脱敏图 */
function buildPublicAlbumNodes(nodes) {
  return (nodes || []).map((node) => ({
    id: node.id,
    title: node.title,
    note: node.note || '',
    images: resolveImageSrcList(
      (node.imagesDesensitized || []).map(resolveMediaUrl)
    ),
  }))
}

/** 读取时兜底：禁止把原图路径暴露到公开案例 */
function sanitizePublicCase(caseItem) {
  if (!caseItem) return caseItem
  const nodes = (caseItem.nodes || []).map((node) => {
    const pool = (node.imagesDesensitized || []).concat(node.images || [])
    return {
      id: node.id,
      title: node.title,
      note: node.note || '',
      images: resolveImageSrcList(
        pool.filter(isDesensitizedUrl).map(resolveMediaUrl)
      ),
    }
  })
  const coverCandidate =
    caseItem.coverImageDesensitized || caseItem.coverImage || ''
  const cover = isDesensitizedUrl(coverCandidate)
    ? resolveImageSrc(resolveMediaUrl(coverCandidate))
    : resolveImageSrc(coverCandidate)
  return {
    ...caseItem,
    coverImage: cover,
    coverImageDesensitized: cover,
    nodes,
  }
}

module.exports = {
  mockDesensitizedUrl,
  applyMockDesensitizeToNodes,
  pickRawCover,
  pickDesensitizedCover,
  buildPublicAlbumNodes,
  sanitizePublicCase,
  isDesensitizedUrl,
  resolveMediaUrl,
  resolveImageSrc,
  resolveImageSrcList,
}
