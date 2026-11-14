/**
 * 托管公开对账：对「未跑大模型 / 模型失败」的单张重跑看图，只取 masks 再贴码。
 * 真源：skill_node_mask_state_machine
 */

const { MODEL_MASKS_INSTRUCTION } = require('./model-mask-instruction')

const BATCH = 4

function text(v) {
  return String(v || '').trim()
}

function rowsFromUrls(urls, describeKeys, describeOnlyKeys) {
  const { rawUrlLookupKeys } = require('./desensitize.constants')
  return (Array.isArray(urls) ? urls : [])
    .map((url, index) => {
      const rawUrl = text(typeof url === 'string' ? url : url && (url.rawUrl || url.url))
      if (!rawUrl) return null
      const lookupKeys = rawUrlLookupKeys(rawUrl)
      const matches = (keys) =>
        keys && keys.size ? lookupKeys.some((key) => keys.has(key)) : false
      const wantDescription = matches(describeKeys)
      const descriptionOnly = matches(describeOnlyKeys)
      return { url: rawUrl, rawUrl, label: `图${index + 1}`, wantDescription, descriptionOnly }
    })
    .filter(Boolean)
}

async function callPrivacyMasksModel(labeled) {
  const { resolveConfiguredNodeAiReviewEngines } = require('../lib/node-ai-review-llm-registry')
  const { chatCompletion } = require('../lib/dashscope-chat')
  const { responsesCompletion } = require('../lib/responses-chat')
  const { parseReviewModelJson } = require('../utils/node-ai-review-rules')
  const engines = resolveConfiguredNodeAiReviewEngines()
  if (!engines.length) {
    const err = new Error('未配置看图模型')
    err.code = 'HOST_PRIVACY_LLM_UNCONFIGURED'
    throw err
  }

  const instruction = [
    '你一次做两件事：1) 框出隐私敏感区；2) 对标注「需内容描述」的图写一句维修过程描述。不要给维修建议。',
    '最终只输出一个 JSON：{"masks":[{"imageSlot":1,"regions":[{"kind":"plate|vin|face|phone|name|document","left":0,"top":0,"width":0,"height":0}],"description":""}]}',
    MODEL_MASKS_INSTRUCTION,
    'masks 数组长度必须等于本次附图张数，每张图一条，绝对不允许省略。',
    '某张图没有敏感区，也必须返回 {"imageSlot":N,"regions":[]}——空 regions 就是无隐私标记；漏图会导致这张被误判为模型失败、整批重跑，严禁漏图。',
    'description 只对标注「需内容描述」的图输出：40~80 字，写清部位、故障或作业、材料；不得写车牌号、姓名、电话等隐私。未标注的图 description 给空字符串。',
  ].join('\n')

  const userContent = [{ type: 'text', text: instruction }].concat(
    labeled.flatMap((row) => {
      const url = text(row.url)
      if (!url) return []
      const label = row.wantDescription ? `${row.label}（需内容描述）` : row.label
      return [
        { type: 'text', text: `下一张图：${label}` },
        { type: 'image_url', image_url: { url } },
      ]
    }),
  )

  let lastErr = null
  for (const engine of engines) {
    try {
      const callModel = engine.protocol === 'responses' ? responsesCompletion : chatCompletion
      const result = await callModel({
        apiUrl: engine.apiUrl,
        apiKey: engine.apiKey,
        model: engine.model,
        messages: [
          { role: 'system', content: '只输出 JSON，不要解释。' },
          { role: 'user', content: userContent },
        ],
        temperature: 0.1,
        responseFormat: undefined,
        enableThinking: engine.vendor === 'dashscope' ? false : undefined,
        timeoutMs: Math.min(Number(engine.timeoutMs || 60000), 90000),
      })
      const parsed = parseReviewModelJson(result && result.text) || {}
      const masks = Array.isArray(parsed.masks) ? parsed.masks : []
      return { masks, engine: engine.id }
    } catch (error) {
      lastErr = error
      console.warn('[host-privacy-llm] engine fail', {
        vendor: engine.vendor,
        model: engine.model,
        message: error && error.message,
      })
    }
  }
  const err = lastErr || new Error('看图打码失败')
  err.code = 'HOST_PRIVACY_LLM_FAILED'
  throw err
}

async function markUrlsLlmFailed(albumId, urls) {
  const list = rowsFromUrls(urls)
  if (!albumId || !list.length) return
  try {
    const {
      loadHostMaskOutcomeIndex,
      lookupHostMaskOutcomeRow,
    } = require('./hosted-public-mask.service')
    const { classifyHostMaskOutcome } = require('../utils/host-mask-outcome')
    const index = await loadHostMaskOutcomeIndex(albumId)
    const pending = []
    list.forEach((row) => {
      const nodeRow = lookupHostMaskOutcomeRow(index, row.rawUrl)
      const classified = classifyHostMaskOutcome(nodeRow || {}, { nodeOnly: true })
      // 已有成功结论的图不得被一次模型失败洗掉
      if (classified.maskSucceeded) return
      pending.push({
        rawUrl: row.rawUrl,
        maskedUrl: '',
        maskOutcome: 'llm_failed',
        // 之前因贴码失败留下的区域要保留，否则下次只能重跑模型
        maskRegions: Array.isArray(nodeRow && nodeRow.maskRegions) ? nodeRow.maskRegions : [],
      })
    })
    if (!pending.length) return
    const { persistMaskedPairsToAlbumFlow } = require('./desensitize.service')
    await persistMaskedPairsToAlbumFlow(albumId, pending)
  } catch (error) {
    console.warn('[host-privacy-llm] write llm_failed failed', error && error.message)
  }
}

/**
 * 对未分析/模型失败的原图重跑大模型并贴码写回节点。
 * @returns {{ ok: number, failed: number }}
 */
async function rerunHostPrivacyLlmForUrls(urls, options = {}) {
  const albumId = text(options.albumId)
  const describeKeys = options.describeUrlKeys instanceof Set ? options.describeUrlKeys : null
  const describeOnlyKeys =
    options.describeOnlyUrlKeys instanceof Set ? options.describeOnlyUrlKeys : null
  const all = rowsFromUrls(urls, describeKeys, describeOnlyKeys)
  if (!all.length) return { ok: 0, failed: 0 }

  const { applyModelMasks } = require('./model-mask.service')
  let ok = 0
  let failed = 0

  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH).map((row, idx) => ({
      ...row,
      label: `图${idx + 1}`,
    }))
    try {
      const { masks } = await callPrivacyMasksModel(batch)
      const pairs = await applyModelMasks(batch, masks, { albumId })
      ok += Array.isArray(pairs) ? pairs.length : 0
      const got = new Set(
        (Array.isArray(pairs) ? pairs : []).map((p) => text(p.rawUrl)),
      )
      const missing = batch.filter((row) => !got.has(row.rawUrl))
      if (missing.length) {
        await markUrlsLlmFailed(
          albumId,
          missing.map((row) => row.rawUrl),
        )
        failed += missing.length
      }
    } catch (_) {
      await markUrlsLlmFailed(
        albumId,
        batch.map((row) => row.rawUrl),
      )
      failed += batch.length
    }
  }

  return { ok, failed }
}

module.exports = {
  rerunHostPrivacyLlmForUrls,
  markUrlsLlmFailed,
  rowsFromUrls,
}
