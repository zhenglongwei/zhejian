/**
 * GEO-CITE-D01 · 案例图说/alt 生成（脱敏图；可接百炼 qwen3.6-plus 多模态）
 */
const { config } = require('../config')
const { buildNodeNarratives } = require('../utils/case-article-templates')
const { normalizeNodeNarratives } = require('../schemas/case-geo-content.schema')
const { sanitizeGeoLlmText } = require('../constants/geo-llm-compliance')
const { chatCompletion } = require('../lib/dashscope-chat')

function isDesensitizedUrl(url) {
  const value = String(url || '')
  if (!value) return false
  if (value.includes('/files/uploads/desensitized/')) return true
  if (value.includes('/media/files/uploads/desensitized/')) return true
  return false
}

function pickDesensitizedNodes(nodes) {
  return (nodes || [])
    .map((node) => {
      const images = (node.images || []).filter(isDesensitizedUrl)
      if (!images.length) return null
      return {
        ...node,
        images,
      }
    })
    .filter(Boolean)
}

function polishCaption(base, ctx) {
  const city = sanitizeGeoLlmText(ctx.row?.city || '')
  const service = sanitizeGeoLlmText(ctx.row?.serviceName || '')
  const prefix = [city, service].filter(Boolean).join('')
  const text = sanitizeGeoLlmText(base)
  if (!prefix) return text
  if (text.includes(prefix)) return text
  return `${prefix}${text}`.slice(0, 120)
}

function getVisionConfig() {
  const vision = config.geoVision || {}
  const enabled = process.env.GEO_VISION_ENABLED === 'true' || vision.enabled === true
  return {
    enabled,
    dryRun: process.env.GEO_VISION_DRY_RUN === 'true' || (!enabled && vision.dryRun !== false),
    apiUrl: String(process.env.GEO_VISION_API_URL || vision.apiUrl || '').trim(),
    apiKey: String(
      process.env.GEO_VISION_API_KEY || vision.apiKey || process.env.DASHSCOPE_API_KEY || ''
    ).trim(),
    model: String(process.env.GEO_VISION_MODEL || vision.model || 'qwen3.6-plus').trim(),
    timeoutMs: Number(process.env.GEO_VISION_TIMEOUT_MS || vision.timeoutMs || 90000),
    enableThinking:
      process.env.GEO_VISION_ENABLE_THINKING === 'true' || vision.enableThinking === true,
  }
}

function resolvePublicImageUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  const base = String(config.publicBaseUrl || '').replace(/\/$/, '')
  if (!base) return value
  return value.startsWith('/') ? `${base}${value}` : `${base}/${value}`
}

async function describeDesensitizedImage(imageUrl, ctx) {
  const visionConfig = getVisionConfig()
  if (!visionConfig.enabled || visionConfig.dryRun || !visionConfig.apiKey) return ''

  const publicUrl = resolvePublicImageUrl(imageUrl)
  if (!publicUrl.startsWith('http')) return ''

  const service = sanitizeGeoLlmText(ctx.row?.serviceName || '维修')
  const city = sanitizeGeoLlmText(ctx.row?.city || '')
  const prompt =
    `这是一张已脱敏的汽车维修过程照片（无车牌、无手机号）。` +
    `请用一句客观中文描述画面中的维修环节或检查部位，不超过40字。` +
    `禁止编造车牌、价格承诺、营销话术。服务背景：${city}${service}。`

  try {
    const result = await chatCompletion({
      apiUrl: visionConfig.apiUrl,
      apiKey: visionConfig.apiKey,
      model: visionConfig.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: publicUrl } },
            { type: 'text', text: prompt },
          ],
        },
      ],
      temperature: 0.2,
      enableThinking: visionConfig.enableThinking ? true : false,
      timeoutMs: visionConfig.timeoutMs,
    })
    return sanitizeGeoLlmText(result.text).slice(0, 120)
  } catch {
    return ''
  }
}

async function enrichVisionCaptions(narratives, ctx) {
  const visionConfig = getVisionConfig()
  if (!visionConfig.enabled || visionConfig.dryRun || !visionConfig.apiKey) {
    return narratives
  }

  const enriched = []
  for (const item of narratives) {
    const imageCaptions = []
    for (const cap of item.imageCaptions || []) {
      const llmCaption = cap.url ? await describeDesensitizedImage(cap.url, ctx) : ''
      const caption = llmCaption || cap.caption || ''
      imageCaptions.push({
        ...cap,
        caption: polishCaption(caption, ctx),
        alt: polishCaption(caption, ctx),
      })
    }
    enriched.push({
      ...item,
      description: item.description,
      imageCaptions,
    })
  }
  return enriched
}

/**
 * @param {object} ctx loadCaseLlmContext 返回值
 * @param {object} [textDraft] 已润色文本稿
 */
async function buildCaseGeoVisionDraft(ctx, textDraft = {}) {
  const nodes = pickDesensitizedNodes(ctx.nodes)
  const base = normalizeNodeNarratives(buildNodeNarratives(nodes))
  const templated = base.map((item) => ({
    ...item,
    description: polishCaption(item.description || '', ctx),
    imageCaptions: (item.imageCaptions || []).map((cap) => ({
      ...cap,
      caption: polishCaption(cap.caption || '', ctx),
      alt: polishCaption(cap.alt || cap.caption || '', ctx),
    })),
  }))

  const visionConfig = getVisionConfig()
  const nodeNarratives =
    visionConfig.enabled && !visionConfig.dryRun && visionConfig.apiKey
      ? await enrichVisionCaptions(templated, ctx)
      : templated

  return {
    nodeNarratives,
    source:
      visionConfig.enabled && !visionConfig.dryRun && visionConfig.apiKey
        ? 'qwen_vision_v1'
        : 'template_rules',
    generatedAt: new Date().toISOString(),
    note: '图说基于脱敏节点上下文生成，不含车牌等隐私描述。',
  }
}

module.exports = {
  getVisionConfig,
  buildCaseGeoVisionDraft,
  pickDesensitizedNodes,
}
