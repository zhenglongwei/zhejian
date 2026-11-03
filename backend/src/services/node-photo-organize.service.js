/**
 * 节点 AI 看图缓存：已识过的图不再送模。
 * 整理入口已删除；真源 docs/04_维修过程相册/26_ 、29_。
 */
const { resolveShared } = require('../utils/resolve-shared')
const { mediaKey } = resolveShared('utils/service-flow-docs.js')

const FLOW_ORGANIZE_PROMPT_VERSION = 'flow-organize-v10'

function text(value) {
  return String(value || '').trim()
}

function classifyReviewVisionRows(labeledUrls, imageByMediaKey, cacheByAlbumImageId) {
  const visionUrls = []
  const cachedFacts = []
  ;(labeledUrls || []).forEach((row) => {
    const url = typeof row === 'string' ? row : row && row.url
    const label = typeof row === 'string' ? '' : text(row && row.label)
    const rawUrl = typeof row === 'string' ? '' : text(row && row.rawUrl)
    const key = mediaKey(rawUrl)
    const imageRow = key ? imageByMediaKey && imageByMediaKey[key] : null
    const hit = imageRow && cacheByAlbumImageId ? cacheByAlbumImageId[imageRow.id] : null
    if (hit && hit.resultJson) {
      const json = hit.resultJson || {}
      cachedFacts.push({
        label,
        partName: text(json.partName || json.category),
        reading: text(json.reading),
        result: text(json.result),
        observation: text(json.observation || json.advice || json.caption),
      })
      return
    }
    visionUrls.push(typeof row === 'string' ? { url, label, rawUrl } : row)
  })
  return { visionUrls, cachedFacts }
}

module.exports = {
  classifyReviewVisionRows,
  FLOW_ORGANIZE_PROMPT_VERSION,
}
