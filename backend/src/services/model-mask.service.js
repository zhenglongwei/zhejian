/**
 * 看图结果里的遮挡区域打在这张图上，并写回节点。
 * 大模型跑通：敏感区空 → ok_no_privacy（不复制原图）；有区 → 贴码写 maskedUrl。
 * 贴码失败 → mask_failed；调用异常 → llm_failed（真源：node-mask-state-machine）。
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
    const rawUrl = String(
      (typeof row === 'string' ? row : row && (row.rawUrl || row.url || row.src)) || '',
    ).trim()
    if (!rawUrl) continue
    const regions = regionsFor(masks, row, index)
    // 模型没给这张判定（masks 缺条目 / 整份为空）→ 未跑通，记 llm_failed。
    // 禁止把「没判」当「看过且无敏感」，否则失败态被洗成 ok_no_privacy。
    if (regions == null) {
      // 不传 maskRegions：保留节点上可能已有的区域，便于以后只重贴
      pairs.push({
        rawUrl,
        maskedUrl: '',
        maskOutcome: 'llm_failed',
      })
      continue
    }
    try {
      const media = await ensureMediaRecordFromUrl(rawUrl)
      if (!media || !media.id) {
        pairs.push({
          rawUrl,
          maskedUrl: '',
          maskOutcome: 'llm_failed',
          maskRegions: regions,
        })
        continue
      }
      const result = await runMediaDesensitize(media.id, {
        // 模型已判这张：空区也要落 ok_no_privacy，冲掉托管引擎留下的失败态
        force: true,
        boxes: regions,
        albumId,
        modelPrivacyJudged: true,
      })
      const maskedUrl = String((result && (result.desensitizedUrl || result.maskedUrl)) || '').trim()
      // 有区却没产物 = 贴码失败；无区且跑通 = 无须打码
      const maskOutcome = maskedUrl
        ? 'ok_masked'
        : regions.length
          ? 'mask_failed'
          : 'ok_no_privacy'
      pairs.push({
        rawUrl,
        maskedUrl,
        maskOutcome,
        maskSource: maskedUrl ? 'auto' : '',
        maskRegions: regions,
      })
    } catch (_) {
      pairs.push({
        rawUrl,
        maskedUrl: '',
        maskOutcome: regions.length ? 'mask_failed' : 'llm_failed',
        maskRegions: regions,
      })
    }
  }
  if (albumId && pairs.length) {
    try {
      const { persistMaskedPairsToAlbumFlow } = require('./desensitize.service')
      await persistMaskedPairsToAlbumFlow(albumId, pairs)
    } catch (error) {
      // 写回失败会让下次托管当未分析重跑；至少要留痕，不能静默
      console.warn('[model-mask] writeback failed', {
        albumId,
        pairs: pairs.length,
        message: String((error && error.message) || '').slice(0, 160),
      })
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
