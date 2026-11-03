/**
 * 看图结果里的遮挡区域打在这张图上，并写回节点 + 媒体表。
 * 大模型跑通：敏感区空 → ok_no_privacy（不复制原图）；有区 → 贴码写 maskedUrl。
 */

function slotOf(row, index) {
  const label = String((row && row.label) || '').trim()
  const named = label.match(/^图\s*(\d+)$/)
  if (named) return Number(named[1])
  return index + 1
}

/**
 * @returns {null|array} null=模型没判这张（勿记 ok_no_privacy）；[]=模型看过且无敏感区
 */
function regionsFor(masks, row, index) {
  const list = Array.isArray(masks) ? masks : []
  if (!list.length) return null
  const slot = slotOf(row, index)
  const hit = list.find((item) => Number(item && item.imageSlot) === slot)
  if (!hit) return null
  const regions = hit.regions || hit.boxes
  return Array.isArray(regions) ? regions : []
}

async function applyModelMasks(rows, masks, options = {}) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return []
  const albumId = String((options && options.albumId) || '').trim()
  const { ensureMediaRecordFromUrl, runMediaDesensitize } = require('./media.service')
  const pairs = []
  for (let index = 0; index < list.length; index += 1) {
    const row = list[index]
    const regions = regionsFor(masks, row, index)
    const rawUrl = String((row && (row.rawUrl || row.url)) || '').trim()
    if (!rawUrl) continue
    // 模型没写这张的 masks → 跳过，留给托管引擎/下次分析，禁止空 masks[] 误标无敏感
    if (regions == null) continue
    try {
      const media = await ensureMediaRecordFromUrl(rawUrl)
      if (!media || !media.id) continue
      const result = await runMediaDesensitize(media.id, {
        force: regions.length > 0,
        boxes: regions,
        albumId,
        modelPrivacyJudged: true,
      })
      const maskedUrl = String((result && (result.desensitizedUrl || result.maskedUrl)) || '').trim()
      const maskOutcome =
        String((result && result.maskOutcome) || '') ||
        (maskedUrl ? 'ok_masked' : 'ok_no_privacy')
      pairs.push({
        rawUrl,
        maskedUrl,
        maskOutcome,
        maskRegions: regions,
      })
    } catch (_) {
      /* 这一张打不上不影响意见正文 */
    }
  }
  if (albumId && pairs.length) {
    try {
      const { persistMaskedPairsToAlbumFlow } = require('./desensitize.service')
      await persistMaskedPairsToAlbumFlow(albumId, pairs)
    } catch (_) {
      /* 写回失败不挡意见 */
    }
  }
  return pairs
}

function rowsFromUrls(urls) {
  return (Array.isArray(urls) ? urls : [])
    .map((url, index) => {
      const rawUrl = String((url && (url.rawUrl || url.url || url)) || '').trim()
      if (!rawUrl) return null
      return {
        url: rawUrl,
        rawUrl,
        label: `图${index + 1}`,
      }
    })
    .filter(Boolean)
}

function masksFromModelRaw(raw) {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object' && Array.isArray(raw.masks)) return raw.masks
  try {
    const { parseReviewModelJson } = require('../utils/node-ai-review-rules')
    const parsed = parseReviewModelJson(raw) || {}
    return Array.isArray(parsed.masks) ? parsed.masks : []
  } catch (_) {
    return []
  }
}

/** 分析返回后再打码，不挡「正在分析」和出意见。 */
function queueApplyModelMasks(urls, raw, options = {}) {
  const masks = masksFromModelRaw(raw)
  const rows = rowsFromUrls(urls)
  if (!rows.length) return
  const albumId = String((options && options.albumId) || '').trim()
  setImmediate(() => {
    applyModelMasks(rows, masks, { albumId }).catch(() => {})
  })
}

module.exports = {
  applyModelMasks,
  queueApplyModelMasks,
  regionsFor,
}
