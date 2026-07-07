/**
 * B-INSP-01 · 相册检查 · 多模态读图（百炼 VL）
 */
const { config } = require('../config')
const { chatCompletion } = require('../lib/dashscope-chat')
const { resolvePlanQuoteImageSources } = require('../lib/plan-quote-image-source')
const { collectVisionImageCandidates } = require('../utils/album-inspection-context')

function readEnv(name) {
  const raw = process.env[name]
  if (raw == null || raw === '') return ''
  return String(raw).trim()
}

function readEnvBool(name, defaultValue = false) {
  const raw = readEnv(name)
  if (!raw) return defaultValue
  return raw.toLowerCase() === 'true'
}

function getInspVisionConfig() {
  const llm = config.inspLlm || {}
  const visionEnabledRaw = readEnv('INSP_VISION_ENABLED')
  const visionEnabled =
    visionEnabledRaw.toLowerCase() === 'true' ||
    (visionEnabledRaw.toLowerCase() !== 'false' && llm.enabled)
  return {
    enabled: visionEnabled,
    dryRun: readEnvBool('INSP_VISION_DRY_RUN') || llm.dryRun,
    apiUrl: String(
      readEnv('INSP_VISION_API_URL') ||
        llm.apiUrl ||
        readEnv('GEO_VISION_API_URL') ||
        '',
    ).trim(),
    apiKey: String(
      readEnv('INSP_VISION_API_KEY') ||
        llm.apiKey ||
        readEnv('DASHSCOPE_API_KEY') ||
        '',
    ).trim(),
    model: String(
      readEnv('INSP_VISION_MODEL') ||
        readEnv('INSP_LLM_VISION_MODEL') ||
        'qwen-vl-plus',
    ).trim(),
    timeoutMs: Number(readEnv('INSP_VISION_TIMEOUT_MS') || llm.timeoutMs || 90000),
    maxImages: Number(readEnv('INSP_MAX_VISION_IMAGES') || 8),
  }
}

async function captionInspectionImage(item) {
  const vision = getInspVisionConfig()
  if (!vision.enabled || vision.dryRun || !vision.apiKey) {
    return {
      ...item,
      caption: '',
      visionSkipped: true,
    }
  }

  let visionUrl = ''
  try {
    const resolved = resolvePlanQuoteImageSources(item.url)
    visionUrl = resolved.visionUrl
  } catch (e) {
    return { ...item, caption: '', visionError: (e && e.message) || 'image_resolve_failed' }
  }

  const prompt =
    `你是汽车维修质检员，正在帮车主读服务相册照片。` +
    `节点：${item.stageTitle} · ${item.label}。` +
    (item.note ? `门店说明：${item.note}。` : '') +
    `请用1～2句客观中文描述照片里看得见的内容（损伤部位、配件包装、单据类型、施工环节等）。` +
    `看不清的不要猜；不要输出完整车牌、手机号；不要下鉴定结论。`

  try {
    const result = await chatCompletion({
      apiUrl: vision.apiUrl,
      apiKey: vision.apiKey,
      model: vision.model,
      temperature: 0.2,
      timeoutMs: vision.timeoutMs,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: visionUrl } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })
    return {
      stageId: item.stageId,
      stageTitle: item.stageTitle,
      label: item.label,
      kind: item.kind,
      caption: String(result.text || '').trim().slice(0, 200),
    }
  } catch (e) {
    return {
      stageId: item.stageId,
      stageTitle: item.stageTitle,
      label: item.label,
      kind: item.kind,
      caption: '',
      visionError: (e && e.message) || 'vision_failed',
    }
  }
}

async function mapConcurrent(items, mapper, concurrency = 3) {
  const list = Array.isArray(items) ? items : []
  const results = []
  for (let i = 0; i < list.length; i += concurrency) {
    const batch = list.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map((item) => mapper(item)))
    results.push(...batchResults)
  }
  return results
}

async function buildInspectionImageCaptions(detail = {}, options = {}) {
  const vision = getInspVisionConfig()
  if (!vision.enabled || vision.dryRun || !vision.apiKey) {
    return []
  }

  const candidates = collectVisionImageCandidates(detail, {
    focusStageId: options.focusStageId,
    maxImages: vision.maxImages,
  })

  const rows = await mapConcurrent(candidates, captionInspectionImage, 3)
  return rows.filter((row) => row.caption)
}

module.exports = {
  getInspVisionConfig,
  buildInspectionImageCaptions,
  captionInspectionImage,
}
