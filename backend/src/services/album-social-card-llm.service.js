/**
 * 短图文：打开时由模型按三个平台写。写不出就交回规则短句。
 */
const fs = require('fs')
const path = require('path')
const { config } = require('../config')
const { chatCompletion } = require('../lib/dashscope-chat')
const { sanitizeGeoLlmText } = require('../constants/geo-llm-compliance')
const { stripSocialText, PLATFORMS } = require('../../../utils/album-social-card')

const PROMPT_PATH = path.join(__dirname, '../prompts/album-social-card.md')

function textModelConfig() {
  const llm = config.geoLlm || {}
  const dryRun = process.env.GEO_LLM_DRY_RUN === 'true' || llm.dryRun === true
  const explicitlyOff = process.env.GEO_LLM_ENABLED === 'false'
  const apiKey = String(llm.apiKey || process.env.DASHSCOPE_API_KEY || '').trim()
  return {
    enabled: !dryRun && !explicitlyOff && Boolean(apiKey),
    apiUrl: llm.apiUrl,
    apiKey,
    model: llm.model || 'qwen3.7-flash',
    timeoutMs: Number(llm.timeoutMs || 45000),
    enableThinking: llm.enableThinking === true,
  }
}

function visionModelConfig() {
  const vision = config.geoVision || {}
  const dryRun = process.env.GEO_VISION_DRY_RUN === 'true' || vision.dryRun === true
  const explicitlyOff = process.env.GEO_VISION_ENABLED === 'false'
  const apiKey = String(
    vision.apiKey || process.env.DASHSCOPE_API_KEY || process.env.GEO_LLM_API_KEY || '',
  ).trim()
  return {
    enabled: !dryRun && !explicitlyOff && Boolean(apiKey),
    apiUrl: vision.apiUrl,
    apiKey,
    model: vision.model || 'qwen3.6-plus',
    timeoutMs: Number(vision.timeoutMs || 60000),
    enableThinking: vision.enableThinking === true,
  }
}

function readSystemPrompt() {
  try {
    return fs.readFileSync(PROMPT_PATH, 'utf8')
  } catch {
    return '只输出 JSON。三个平台各写一版，不编造事实，不写金额。'
  }
}

function extractJson(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
}

function cleanLine(value, max) {
  const text = stripSocialText(sanitizeGeoLlmText(value)).replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.slice(0, max)
}

function cleanBlock(value, max) {
  const text = stripSocialText(sanitizeGeoLlmText(value))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
  if (!text) return ''
  return text.slice(0, max)
}

function parseSocialCardLlm(raw) {
  const json = extractJson(raw)
  if (!json || typeof json !== 'object') return null
  const moments = cleanBlock(json.moments, 160)
  const cover = cleanLine(json.xiaohongshuCover, 22)
  const xBody = cleanBlock(json.xiaohongshuBody, 360)
  const overlay = cleanBlock(json.douyinOverlay, 72)
  const dBody = cleanBlock(json.douyinBody, 280)
  if (!moments || !cover || !xBody || !overlay || !dBody) return null
  const byId = {
    moments: { text: moments, caption: '' },
    xiaohongshu: { text: cover, caption: xBody },
    douyin: { text: overlay, caption: dBody },
  }
  return PLATFORMS.map((platform) => ({
    id: platform.id,
    label: platform.label,
    text: byId[platform.id].text,
    caption: byId[platform.id].caption,
  }))
}

function publicImageUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  const base = String(config.publicBaseUrl || '').replace(/\/$/, '')
  if (!base) return ''
  return value.startsWith('/') ? `${base}${value}` : `${base}/${value}`
}

function buildUserContent(audience, facts, imageUrls) {
  const who = audience === 'merchant' ? '门店口吻，不要写成车主第一人称。' : '车主口吻，朋友圈用第一人称。'
  const text = `${who}\n事实：\n${JSON.stringify(facts)}`
  if (!imageUrls.length) return text
  return [
    { type: 'text', text: `${text}\n下面是打码后的实拍，按画面里能看见的写，不要猜。` },
    ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
  ]
}

async function writePlatformCards({ audience = 'owner', facts = {}, images = [], complete = chatCompletion } = {}) {
  const vision = visionModelConfig()
  const textModel = textModelConfig()
  const imageUrls = (images || [])
    .map((item) => publicImageUrl(item && item.url))
    .filter((url) => url.startsWith('http'))
    .slice(0, 4)
  const useVision = vision.enabled && imageUrls.length > 0
  const model = useVision ? vision : textModel
  if (!model.enabled || !model.apiKey) return null

  const result = await complete({
    apiUrl: model.apiUrl,
    apiKey: model.apiKey,
    model: model.model,
    messages: [
      { role: 'system', content: readSystemPrompt() },
      { role: 'user', content: buildUserContent(audience, facts, useVision ? imageUrls : []) },
    ],
    temperature: 0.4,
    enableThinking: model.enableThinking ? true : false,
    timeoutMs: Math.min(Number(model.timeoutMs) || 45000, 60000),
  })
  const cards = parseSocialCardLlm(result && result.text)
  if (!cards) return null
  return { cards, source: useVision ? 'llm_vision' : 'llm' }
}

module.exports = {
  parseSocialCardLlm,
  writePlatformCards,
  textModelConfig,
  visionModelConfig,
}
