/**
 * 托管公开对账：对「未跑大模型 / 模型失败」的单张重跑看图，只取 masks 再贴码。
 * 真源：skill_node_mask_state_machine
 */

const { MODEL_MASKS_INSTRUCTION } = require('./model-mask-instruction')

const BATCH = 4

function text(v) {
  return String(v || '').trim()
}

function rowsFromUrls(urls) {
  return (Array.isArray(urls) ? urls : [])
    .map((url, index) => {
      const rawUrl = text(typeof url === 'string' ? url : url && (url.rawUrl || url.url))
      if (!rawUrl) return null
      return { url: rawUrl, rawUrl, label: `图${index + 1}` }
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
    '你只做隐私打码框选，不要给维修意见。',
    '最终只输出一个 JSON：{"masks":[{"imageSlot":1,"regions":[{"kind":"plate|vin|face|phone|name|document","left":0,"top":0,"width":0,"height":0}]}]}',
    MODEL_MASKS_INSTRUCTION,
    '再次强调：masks 数组长度必须等于本次附图张数，每张图一条，绝对不允许省略。',
    '某张图没有敏感区，也必须返回 {"imageSlot":N,"regions":[]}——空 regions 就是无隐私标记；漏图会导致这张被误判为模型失败、整批重跑，严禁漏图。',
  ].join('\n')

  const userContent = [{ type: 'text', text: instruction }].concat(
    labeled.flatMap((row) => {
      const url = text(row.url)
      if (!url) return []
      return [
        { type: 'text', text: `下一张图：${row.label}` },
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
          { role: 'system', content: '只输出 masks JSON，不要解释。' },
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
  const all = rowsFromUrls(urls)
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
