const fs = require('fs')
const path = require('path')
const { config } = require('../config')
const { chatCompletion } = require('../lib/dashscope-chat')

const PROMPT_PATH = path.join(__dirname, '../prompts/merchant-photo-advice.md')
const SLOT_LABEL = {
  facade: '门头',
  workshop: '工位',
  reception: '接待区',
}

function text(value) {
  return String(value || '').trim()
}

function readPrompt() {
  try {
    return fs.readFileSync(PROMPT_PATH, 'utf8')
  } catch (e) {
    return '看环境照片，给最多 3 条拍摄建议。只输出 JSON：{"lines":[""]}'
  }
}

function httpUrl(value) {
  const url = text(value)
  if (!/^https?:\/\//i.test(url)) return ''
  return url
}

function normalizeRequest(input = {}) {
  const images = []
  ;(Array.isArray(input.images) ? input.images : []).forEach((item) => {
    if (images.length >= 6) return
    const slot = SLOT_LABEL[item && item.slot] || text(item && item.slot)
    const url = httpUrl(item && item.url)
    if (!slot || !url) return
    const width = Number(item && item.width) || 0
    const height = Number(item && item.height) || 0
    images.push({
      slot,
      url,
      width: width > 0 ? width : 0,
      height: height > 0 ? height : 0,
    })
  })
  const missing = (Array.isArray(input.missing) ? input.missing : [])
    .map((item) => text(item))
    .filter((item) => Object.values(SLOT_LABEL).indexOf(item) >= 0)
  return { images, missing }
}

function parsePhotoAdvice(raw) {
  const body = String(raw || '').trim()
  if (!body) return []
  let parsed = null
  try {
    parsed = JSON.parse(body)
  } catch (e) {
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(body.slice(start, end + 1))
      } catch (err) {
        parsed = null
      }
    }
  }
  const lines = parsed && Array.isArray(parsed.lines) ? parsed.lines : []
  return lines.map(text).filter(Boolean).slice(0, 3)
}

async function adviseStorePhotos(input = {}) {
  const vision = config.geoVision || {}
  const apiKey = text(vision.apiKey)
  if (!apiKey || vision.dryRun) {
    const err = new Error('收录建议暂不可用')
    err.status = 503
    throw err
  }
  const payload = normalizeRequest(input)
  if (!payload.images.length) {
    const err = new Error('还没有可看的照片')
    err.status = 400
    throw err
  }
  const notes = payload.images.map((item) => {
    const size = item.width && item.height ? `，${item.width}×${item.height}` : ''
    return `${item.slot}${size}`
  })
  const brief = {
    missing: payload.missing,
    uploaded: notes,
  }
  const userContent = [
    { type: 'text', text: `${readPrompt()}\n资料：${JSON.stringify(brief)}` },
  ]
  payload.images.forEach((item, index) => {
    userContent.push({ type: 'text', text: `第 ${index + 1} 张：${item.slot}` })
    userContent.push({ type: 'image_url', image_url: { url: item.url } })
  })
  const result = await chatCompletion({
    apiUrl: vision.apiUrl,
    apiKey,
    model: vision.model || 'qwen3.6-plus',
    messages: [
      { role: 'system', content: '只输出 JSON。' },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    responseFormat: { type: 'json_object' },
    enableThinking: false,
    timeoutMs: Math.min(Number(vision.timeoutMs || 60000), 60000),
  })
  const lines = parsePhotoAdvice(result && result.text)
  if (!lines.length) {
    const err = new Error('没有生成建议')
    err.status = 502
    throw err
  }
  return lines
}

module.exports = {
  adviseStorePhotos,
  parsePhotoAdvice,
  normalizeRequest,
}
