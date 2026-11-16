/**
 * 托管公开读侧：打码结论与展示地址都只认节点。
 * 任务行 / 媒体表是作业流水，不参与选图，也不参与判定。
 */
const { prisma } = require('../lib/prisma')

/**
 * 节点图结论索引：打码结论只住节点。
 * 任务行 / 媒体表不参与判定（无节点结论 = not_analyzed）。
 */

/** 遍历节点挂图的统一游走器（结论索引与全量 URL 集合共用同一口径） */
function walkNodeImageSlots(pkg, visit) {
  const walkBag = (bag) => {
    if (!bag || typeof bag !== 'object') return
    ;['photos', 'discoveryImages', 'pendingImages'].forEach((key) => {
      ;(Array.isArray(bag[key]) ? bag[key] : []).forEach(visit)
    })
    ;['findings', 'workItems', 'items', 'lines', 'acceptanceItems'].forEach(
      (key) => {
        ;(Array.isArray(bag[key]) ? bag[key] : []).forEach((row) => {
          if (!row || typeof row !== 'object') return
          visit(row)
          ;(Array.isArray(row.images) ? row.images : []).forEach(visit)
          if (row.evidenceUrl) {
            visit({
              url: row.evidenceUrl,
              maskedUrl: row.evidenceMaskedUrl,
              maskOutcome: row.evidenceMaskOutcome,
              maskRegions: row.evidenceMaskRegions,
            })
          }
        })
      },
    )
  }
  ;(Array.isArray(pkg && pkg.flowNodes) ? pkg.flowNodes : []).forEach((node) => {
    if (!node) return
    if (node.content) walkBag(node.content)
    if (node.photoDraft) walkBag(node.photoDraft)
    if (node.document && node.document.payload) walkBag(node.document.payload)
  })
}

async function loadAlbumContentPackage(albumId) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { contentPackageJson: true },
  })
  return album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
    ? album.contentPackageJson
    : {}
}

/**
 * 节点上全部图 URL 的查找键集合（无论有无打码结论）。
 * 用于识别任务行里的「幽灵资产」：URL 在当前节点上已不存在的旧行，
 * 重跑大模型也写不回，只会白烧模型拖慢每次对账。
 */
async function loadHostNodeImageUrlKeys(albumId) {
  const { rawUrlLookupKeys } = require('./desensitize.constants')
  const keys = new Set()
  try {
    const pkg = await loadAlbumContentPackage(albumId)
    const add = (slot) => {
      if (!slot || typeof slot !== 'object') return
      const raw = String(slot.url || slot.src || slot.rawUrl || '').trim()
      if (raw) rawUrlLookupKeys(raw).forEach((key) => key && keys.add(key))
    }
    walkNodeImageSlots(pkg, add)
  } catch (_) {
    /* node optional */
  }
  return keys
}

async function loadHostMaskOutcomeIndex(albumId) {
  const { rawUrlLookupKeys } = require('./desensitize.constants')
  const index = new Map()
  const put = (url, row) => {
    rawUrlLookupKeys(url).forEach((key) => {
      if (key) index.set(key, row)
    })
  }
  try {
    const pkg = await loadAlbumContentPackage(albumId)
    const collect = (slot) => {
      if (!slot || typeof slot !== 'object') return
      const raw = String(slot.url || slot.src || slot.rawUrl || '').trim()
      if (!raw) return
      const outcome = String(slot.maskOutcome || '').trim()
      const masked = String(slot.maskedUrl || slot.preMaskedUrl || '').trim()
      // 只登记真有结论或产物的节点图；裸图不写空行，交给默认 not_analyzed
      if (!outcome && !masked) return
      put(raw, {
        maskOutcome: outcome || (masked ? 'ok_masked' : ''),
        maskSource: String(slot.maskSource || '').trim(),
        maskedUrl: masked,
        preMaskedUrl: masked,
        maskRegions: Array.isArray(slot.maskRegions) ? slot.maskRegions : [],
        riskTags: [],
        status: '',
        desensitizeStatus: '',
      })
    }
    walkNodeImageSlots(pkg, collect)
  } catch (_) {
    /* node optional */
  }
  return index
}

function lookupHostMaskOutcomeRow(index, url) {
  if (!index || !url) return null
  const { rawUrlLookupKeys } = require('./desensitize.constants')
  for (const key of rawUrlLookupKeys(url)) {
    if (index.has(key)) return index.get(key)
  }
  return null
}

/**
 * 节点上还有多少张图没跑过大模型（not_analyzed）。
 * 0 = 对账已开始过一轮；失败态（llm_failed / mask_failed）不在此列，不挡预览。
 */
async function countUnanalyzedNodeImages(albumId, outcomeIndex) {
  try {
    const pkg = await loadAlbumContentPackage(albumId)
    if (!pkg || !Object.keys(pkg).length) return 0
    const index =
      outcomeIndex instanceof Map ? outcomeIndex : await loadHostMaskOutcomeIndex(albumId)
    const urls = new Set()
    walkNodeImageSlots(pkg, (slot) => {
      if (!slot || typeof slot !== 'object') return
      const raw = String(slot.url || slot.src || slot.rawUrl || '').trim()
      if (raw) urls.add(raw)
    })
    let pending = 0
    urls.forEach((raw) => {
      const row = lookupHostMaskOutcomeRow(index, raw)
      const code = String((row && row.maskOutcome) || '').trim()
      if (!row || !code || code === 'not_analyzed' || code === 'pending') pending += 1
    })
    return pending
  } catch (_) {
    return 0
  }
}

module.exports = {
  loadHostMaskOutcomeIndex,
  lookupHostMaskOutcomeRow,
  countUnanalyzedNodeImages,
  loadHostNodeImageUrlKeys,
}
