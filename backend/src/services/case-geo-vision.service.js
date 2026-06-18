/**
 * GEO-CITE-D01 · 案例图说/alt 生成（仅脱敏图上下文；默认规则稿，可扩展 vision API）
 */
const { config } = require('../config')
const { buildNodeNarratives } = require('../utils/case-article-templates')
const { normalizeNodeNarratives } = require('../schemas/case-geo-content.schema')
const { sanitizeGeoLlmText } = require('../constants/geo-llm-compliance')

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

/**
 * @param {object} ctx loadCaseLlmContext 返回值
 * @param {object} [textDraft] 已润色文本稿
 */
function buildCaseGeoVisionDraft(ctx, textDraft = {}) {
  const nodes = pickDesensitizedNodes(ctx.nodes)
  const base = normalizeNodeNarratives(buildNodeNarratives(nodes))
  const narratives = base.map((item) => ({
    ...item,
    description: polishCaption(item.description || '', ctx),
    imageCaptions: (item.imageCaptions || []).map((cap) => ({
      ...cap,
      caption: polishCaption(cap.caption || '', ctx),
      alt: polishCaption(cap.alt || cap.caption || '', ctx),
    })),
  }))

  return {
    nodeNarratives: narratives,
    source: getVisionConfig().enabled ? 'vision_v1' : 'template_rules',
    generatedAt: new Date().toISOString(),
    note: '图说基于脱敏节点上下文生成，不含车牌等隐私描述。',
  }
}

function getVisionConfig() {
  const vision = config.geoVision || {}
  return {
    enabled: process.env.GEO_VISION_ENABLED === 'true' || vision.enabled === true,
    dryRun: process.env.GEO_VISION_DRY_RUN !== 'false' && vision.dryRun !== false,
  }
}

module.exports = {
  getVisionConfig,
  buildCaseGeoVisionDraft,
  pickDesensitizedNodes,
}
