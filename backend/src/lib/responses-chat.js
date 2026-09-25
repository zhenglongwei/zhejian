/**
 * Responses API 调用（火山方舟 /api/v3/responses 同构）
 *
 * 与 chat/completions 是两套协议：请求用 input 而不是 messages，
 * 文本块叫 input_text、图片块叫 input_image；回答文本在 output 数组里。
 * 只做节点 AI 检查需要的最小子集：非流式、单轮、可带图。
 */

function resolveErrorMessage(body, status) {
  if (body && typeof body === 'object') {
    const message = (body.error && body.error.message) || body.message
    if (message) return String(message)
  }
  return `HTTP ${status}`
}

/** chat/completions 风格的 messages → Responses input（文本→input_text，图→input_image） */
function toResponsesInput(messages) {
  return (messages || []).map((message) => {
    const role = String((message && message.role) || 'user')
    const content = message && message.content
    if (typeof content === 'string') {
      return { role, content: [{ type: 'input_text', text: content }] }
    }
    const normalized = []
    ;(Array.isArray(content) ? content : []).forEach((part) => {
      if (!part || typeof part !== 'object') return
      if ((part.type === 'text' || part.type === 'input_text') && part.text) {
        normalized.push({ type: 'input_text', text: String(part.text) })
        return
      }
      if (part.type === 'image_url') {
        const url =
          part.image_url && typeof part.image_url === 'object'
            ? part.image_url.url
            : part.image_url
        if (url) normalized.push({ type: 'input_image', image_url: String(url) })
      }
    })
    if (!normalized.length) normalized.push({ type: 'input_text', text: '' })
    return { role, content: normalized }
  })
}

/** 从 Responses 响应里取回答文本（output → message → output_text） */
function extractResponsesText(value) {
  const chunks = []
  const seen = new Set()
  function push(text) {
    const trimmed = String(text || '').trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    chunks.push(trimmed)
  }
  function walk(node) {
    if (!node) return
    if (typeof node === 'string') {
      push(node)
      return
    }
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node !== 'object') return
    if (node.type === 'output_text' && node.text) {
      push(node.text)
      return
    }
    if (node.type === 'message' && Array.isArray(node.content)) {
      node.content.forEach(walk)
      return
    }
    if (typeof node.text === 'string') push(node.text)
    if (node.content) walk(node.content)
    if (node.output) walk(node.output)
  }
  walk(value)
  return chunks.join('\n')
}

/**
 * @param {{ apiUrl: string, apiKey: string, model: string, messages: object[], temperature?: number, timeoutMs?: number }} options
 * @returns {Promise<{ text: string }>}
 */
async function responsesCompletion(options) {
  const controller = new AbortController()
  const timeoutMs = Number(options.timeoutMs) || 60000
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(String(options.apiUrl || '').trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${String(options.apiKey || '').trim()}`,
      },
      body: JSON.stringify({
        model: String(options.model || '').trim(),
        input: toResponsesInput(options.messages || []),
        temperature: options.temperature != null ? options.temperature : 0.2,
        stream: false,
      }),
      signal: controller.signal,
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(resolveErrorMessage(body, res.status))
      err.status = res.status
      err.body = body
      throw err
    }
    return { text: extractResponsesText(body) }
  } catch (error) {
    if (error && error.name === 'AbortError') {
      const err = new Error('模型响应超时')
      throw err
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

module.exports = {
  responsesCompletion,
  toResponsesInput,
  extractResponsesText,
}
