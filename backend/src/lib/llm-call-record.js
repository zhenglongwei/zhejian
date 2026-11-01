const fs = require('fs')
const path = require('path')

const RECORD_DIR = path.join(__dirname, '../../data/llm-calls')

function callerFromStack() {
  const lines = String(new Error().stack || '').split('\n')
  const hits = []
  for (const line of lines) {
    if (
      line.includes('llm-call-record') ||
      line.includes('dashscope-chat') ||
      line.includes('responses-chat') ||
      line.includes('web-search-chat')
    ) {
      continue
    }
    const match = line.match(/([A-Za-z0-9_.-]+\.js:\d+)/)
    if (!match) continue
    hits.push(match[1])
    if (hits.length >= 2) break
  }
  return hits.join(' <- ')
}

function scrubUrl(value) {
  const text = String(value || '')
  if (!text) return text
  if (text.startsWith('data:')) return `[data-url omitted ${text.length} chars]`
  const cut = text.split('?')[0]
  return cut
}

function scrubNode(value, depth = 0) {
  if (depth > 12 || value == null) return value
  if (typeof value === 'string') {
    if (value.startsWith('data:image') || value.length > 200 && value.startsWith('data:')) {
      return `[data-url omitted ${value.length} chars]`
    }
    return value
  }
  if (Array.isArray(value)) return value.map((item) => scrubNode(item, depth + 1))
  if (typeof value !== 'object') return value
  const out = {}
  Object.keys(value).forEach((key) => {
    if (key === 'apiKey' || key === 'authorization' || key === 'Authorization') return
    const child = value[key]
    if ((key === 'url' || key === 'image_url') && typeof child === 'string') {
      out[key] = scrubUrl(child)
      return
    }
    if (key === 'image_url' && child && typeof child === 'object') {
      out[key] = scrubNode(child, depth + 1)
      return
    }
    out[key] = scrubNode(child, depth + 1)
  })
  return out
}

function apiHost(url) {
  try {
    return new URL(String(url || '')).host
  } catch (_) {
    return ''
  }
}

/**
 * 每次大模型调用的请求摘要和完整返回，按天落在 backend/data/llm-calls。
 * 不写密钥。图片只留地址，去掉签名参数。
 */
function recordLlmCall(entry) {
  try {
    const at = new Date()
    const day = at.toISOString().slice(0, 10)
    const dir = path.join(RECORD_DIR, day)
    fs.mkdirSync(dir, { recursive: true })
    const name = `${at.getTime()}-${Math.random().toString(36).slice(2, 8)}.json`
    const file = path.join(dir, name)
    const payload = {
      at: at.toISOString(),
      ...entry,
    }
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8')
    console.info('[llm-call] saved', path.relative(path.join(__dirname, '../..'), file).replace(/\\/g, '/'), entry.model || '', entry.ok === false ? 'fail' : 'ok')
    return file
  } catch (error) {
    console.warn('[llm-call] save failed', error && error.message)
    return ''
  }
}

module.exports = {
  RECORD_DIR,
  callerFromStack,
  scrubNode,
  scrubUrl,
  apiHost,
  recordLlmCall,
}
