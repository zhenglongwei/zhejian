/**
 * 看图结果里的遮挡区域打在这张图上。
 * 车架号、人脸、手机号、姓名、证件有区域才打。
 * 车牌没有框时，打码这一步会再认一次。
 */

function slotOf(row, index) {
  const label = String((row && row.label) || '').trim()
  const named = label.match(/^图\s*(\d+)$/)
  if (named) return Number(named[1])
  return index + 1
}

function regionsFor(masks, row, index) {
  const list = Array.isArray(masks) ? masks : []
  const slot = slotOf(row, index)
  const hit = list.find((item) => Number(item && item.imageSlot) === slot)
  const regions = hit && (hit.regions || hit.boxes)
  return Array.isArray(regions) ? regions : []
}

async function applyModelMasks(rows, masks) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return
  const { ensureMediaRecordFromUrl, runMediaDesensitize } = require('./media.service')
  for (let index = 0; index < list.length; index += 1) {
    const row = list[index]
    const regions = regionsFor(masks, row, index)
    const rawUrl = String((row && (row.rawUrl || row.url)) || '').trim()
    if (!rawUrl) continue
    try {
      const media = await ensureMediaRecordFromUrl(rawUrl)
      if (!media || !media.id) continue
      await runMediaDesensitize(media.id, {
        force: regions.length > 0,
        boxes: regions,
      })
    } catch (_) {
      /* 这一张打不上不影响归组 */
    }
  }
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
function queueApplyModelMasks(urls, raw) {
  const masks = masksFromModelRaw(raw)
  const rows = rowsFromUrls(urls)
  if (!rows.length) return
  setImmediate(() => {
    applyModelMasks(rows, masks).catch(() => {})
  })
}

module.exports = {
  applyModelMasks,
  queueApplyModelMasks,
  regionsFor,
}
