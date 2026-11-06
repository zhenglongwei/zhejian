/**
 * 短图文：打开时由模型按三个平台写。写不出就交回规则短句。
 */
const fs = require('fs')
const path = require('path')
const { config } = require('../config')
const { chatCompletion } = require('../lib/dashscope-chat')
const { sanitizeGeoLlmText } = require('../constants/geo-llm-compliance')
const { stripSocialText, PLATFORMS } = require('../../../utils/album-social-card')

const PROMPT_DIR = path.join(__dirname, '../prompts')

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

function readPrompt(name) {
  try {
    return fs.readFileSync(path.join(PROMPT_DIR, name), 'utf8')
  } catch {
    return '只输出 JSON。不编造事实，不写金额。'
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

function parseHighlight(raw) {
  const json = extractJson(raw)
  if (!json || typeof json !== 'object') return null
  const highlight = cleanLine(json.highlight, 80)
  if (!highlight) return null
  const picks = []
  ;(Array.isArray(json.picks) ? json.picks : []).forEach((id) => {
    const key = String(id || '').trim()
    if (key && !picks.includes(key)) picks.push(key)
  })
  const seen = []
  ;(Array.isArray(json.seen) ? json.seen : []).forEach((row) => {
    const id = String((row && (row.id || row.imageId)) || '').trim()
    const note = cleanLine(row && (row.note || row.observation), 120)
    if (id && note) seen.push({ id, note })
  })
  return { highlight, because: cleanLine(json.because, 120), picks, seen }
}

function parseThemeJudge(raw) {
  const json = extractJson(raw)
  if (!json || typeof json !== 'object') return null
  const gap = String(json.gap || '').trim()
  const theme = cleanLine(json.theme, 40)
  const because = cleanLine(json.because, 120)
  const choice = ['rule', 'keep', 'fuse'].includes(String(json.choice || '').trim())
    ? String(json.choice).trim()
    : ''
  if (gap === 'far') return { gap: 'far', theme: '', because, choice: '' }
  if (theme) return { gap: gap === 'close' ? 'close' : '', theme, because, choice }
  return null
}

function parseSocialCardLlm(raw, images) {
  const json = extractJson(raw)
  if (!json || typeof json !== 'object') return null
  const theme = cleanLine(json.theme, 40)
  const moments = cleanBlock(json.moments, 160)
  const xBody = cleanBlock(json.xiaohongshuBody, 450)
  const dBody = cleanBlock(json.douyinBody, 300)
  if (!theme || !moments || !xBody || !dBody) return null
  const known = new Set(
    (Array.isArray(images) ? images : [])
      .map((item) => String((item && item.id) || '').trim())
      .filter(Boolean),
  )
  const seen = new Set()
  const slides = []
  ;(Array.isArray(json.slides) ? json.slides : []).forEach((row) => {
    const id = String((row && (row.imageId || row.id)) || '').trim()
    if (!id || seen.has(id)) return
    if (known.size && !known.has(id)) return
    seen.add(id)
    slides.push({ id, line: cleanLine(row && row.line, 16) })
  })
  ;(Array.isArray(images) ? images : []).forEach((item) => {
    const id = String((item && item.id) || '').trim()
    if (!id || seen.has(id)) return
    seen.add(id)
    slides.push({ id, line: '' })
  })
  const body = {
    moments: { text: moments, caption: '' },
    xiaohongshu: { text: '', caption: xBody },
    douyin: { text: '', caption: dBody },
  }
  return PLATFORMS.map((platform) => ({
    id: platform.id,
    label: platform.label,
    text: body[platform.id].text,
    caption: body[platform.id].caption,
    slides: slides.map((slide) => ({
      id: slide.id,
      line: platform.id === 'moments' ? '' : slide.line,
    })),
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

function caseText(facts, images, extra) {
  const photos = (images || []).map((item) => ({
    id: String((item && item.id) || '').trim(),
    note: String((item && item.prior) || '').trim(),
  })).filter((item) => item.id)
  return [
    extra,
    `事实：\n${JSON.stringify(facts)}`,
    `照片：\n${JSON.stringify(photos)}`,
  ].filter(Boolean).join('\n')
}

function photoBrief(images) {
  return (images || []).map((item) => {
    const note = String((item && item.prior) || '').trim()
    return note ? `- ${item.id}：已有分析：${note}` : `- ${item.id}：还没有分析`
  }).join('\n')
}

function withImages(text, imageUrls) {
  if (!imageUrls.length) return text
  return [
    { type: 'text', text: `${text}\n下面按照片 id 的顺序，是打码后的实拍。` },
    ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
  ]
}

function voiceLine(audience) {
  return audience === 'merchant'
    ? '门店口吻。用「这台」，不要写成车主第一人称。朋友圈可以在合适时收一句「过来坐坐」，不每条都写。不写电话、价钱、到店优惠。'
    : '车主口吻。用「我这台」。不要写「过来坐坐」。'
}

function applyFreshLooks(images, seen) {
  const notes = new Map()
  ;(seen || []).forEach((row) => {
    if (row && row.id && row.note) notes.set(row.id, row.note)
  })
  const fresh = []
  const next = (images || []).map((item) => {
    if (!item || String(item.prior || '').trim() || !notes.has(item.id)) return item
    fresh.push({ id: item.id, note: notes.get(item.id), url: item.url || '' })
    return { ...item, prior: notes.get(item.id) }
  })
  return { images: next, fresh }
}

function keepPicked(images, picks) {
  const known = new Map((images || []).map((item) => [item.id, item]))
  const picked = (picks || []).map((id) => known.get(id)).filter(Boolean)
  return picked.length ? picked : images
}

async function writePlatformCards({
  audience = 'owner',
  facts = {},
  images = [],
  complete = chatCompletion,
  model: modelOverride = null,
  rememberLook = null,
} = {}) {
  const vision = visionModelConfig()
  const textModel = textModelConfig()
  const listed = (images || []).filter((item) => item && item.id).slice(0, 9)
  const unseenUrls = listed
    .filter((item) => !String(item.prior || '').trim())
    .map((item) => publicImageUrl(item.url))
    .filter((url) => url.startsWith('http'))
  const useVision = !modelOverride && vision.enabled && unseenUrls.length > 0
  const model = modelOverride || (useVision ? vision : textModel)
  if (!model.enabled || !model.apiKey) return null

  const attachUrls = modelOverride || useVision ? unseenUrls : []
  const ask = (promptName, content) => complete({
    apiUrl: model.apiUrl,
    apiKey: model.apiKey,
    model: model.model,
    messages: [
      { role: 'system', content: readPrompt(promptName) },
      { role: 'user', content },
    ],
    temperature: 0.4,
    enableThinking: model.enableThinking ? true : false,
    timeoutMs: Math.min(Number(model.timeoutMs) || 45000, 60000),
  })
  const highlightResult = await ask(
    'album-social-card-highlight.md',
    withImages(`${caseText(facts, listed)}\n${photoBrief(listed)}`, attachUrls),
  )
  const highlight = parseHighlight(highlightResult && highlightResult.text)
  if (!highlight) return null
  const looked = applyFreshLooks(listed, highlight.seen)
  if (typeof rememberLook === 'function' && looked.fresh.length) {
    try {
      await rememberLook(looked.fresh)
    } catch (err) {
      console.warn('[social-card] look note skipped', err && err.message)
    }
  }
  const chosen = keepPicked(looked.images, highlight.picks)
  const album = caseText(facts, chosen)

  const judgedResult = await ask(
    'album-social-card-theme.md',
    [
      `出彩处：${highlight.highlight}`,
      `依据：${highlight.because || '案例里能看见'}`,
      album,
    ].join('\n'),
  )
  const judged = parseThemeJudge(judgedResult && judgedResult.text)
  if (!judged) return null

  let theme = judged.theme
  if (judged.gap === 'far') {
    const decided = await ask(
      'album-social-card-decide.md',
      [
        `出彩处：${highlight.highlight}`,
        `依据：${highlight.because || '案例里能看见'}`,
        `对比：${judged.because || '和类目不是同一件事'}`,
        album,
      ].join('\n'),
    )
    const locked = parseThemeJudge(decided && decided.text)
    theme = locked && locked.theme
  }
  if (!theme) return null

  const written = await ask(
    'album-social-card.md',
    `${voiceLine(audience)}\n主题已定，不要改：${theme}\n${album}`,
  )
  const cards = parseSocialCardLlm(written && written.text, chosen)
  if (cards && audience !== 'merchant') {
    cards.forEach((card) => {
      card.text = String(card.text || '').replace(/过来坐坐[，。]?/g, '').trim()
      card.caption = String(card.caption || '').replace(/过来坐坐[，。]?/g, '').trim()
    })
  }
  if (!cards) return null
  return {
    cards,
    images: chosen.map((item) => ({ id: item.id, url: item.url })),
    source: useVision ? 'llm_vision' : 'llm',
  }
}

module.exports = {
  parseHighlight,
  parseThemeJudge,
  parseSocialCardLlm,
  writePlatformCards,
  textModelConfig,
  visionModelConfig,
}
