/**
 * 阿里云百炼 · OpenAI 兼容 Chat Completions
 * @see https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions
 */

const DEFAULT_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

function resolveApiError(body, status) {
  return (
    body?.error?.message ||
    body?.message ||
    (body?.code ? `${body.code}: ${body.message || ''}` : '') ||
    `HTTP ${status}`
  )
}

function extractMessageContent(message) {
  if (!message || typeof message !== 'object') return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return ''
        if (part.type === 'text') return String(part.text || '')
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return String(content || '')
}

function parseChatCompletionBody(body) {
  const choice = body?.choices?.[0]
  const message = choice?.message || {}
  const text =
    extractMessageContent(message) ||
    body?.output?.text ||
    body?.result ||
    ''
  return {
    text: String(text),
    reasoning: String(message.reasoning_content || ''),
    finishReason: choice?.finish_reason || '',
    usage: body?.usage || null,
  }
}

/**
 * @param {{
 *   apiUrl?: string,
 *   apiKey: string,
 *   model: string,
 *   messages: Array<{ role: string, content: string|Array<object> }>,
 *   temperature?: number,
 *   responseFormat?: { type: string } | null,
 *   enableThinking?: boolean,
 *   timeoutMs?: number,
 * }} options
 */
async function chatCompletion(options) {
  const apiKey = String(options.apiKey || '').trim()
  if (!apiKey) {
    const err = new Error('缺少 LLM API Key')
    err.status = 400
    throw err
  }

  const apiUrl = String(options.apiUrl || DEFAULT_API_URL).trim()
  const payload = {
    model: String(options.model || 'qwen-plus').trim(),
    messages: options.messages || [],
    temperature: options.temperature != null ? options.temperature : 0.2,
  }

  if (options.responseFormat) {
    payload.response_format = options.responseFormat
  }

  if (options.enableThinking === false) {
    payload.enable_thinking = false
  } else if (options.enableThinking === true) {
    payload.enable_thinking = true
  }

  const controller = new AbortController()
  const timeoutMs = Number(options.timeoutMs) || 45000
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(resolveApiError(body, res.status))
      err.status = res.status
      err.body = body
      throw err
    }
    return parseChatCompletionBody(body)
  } catch (error) {
    if (error.name === 'AbortError') {
      const err = new Error('llm_timeout')
      err.code = 'LLM_TIMEOUT'
      throw err
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

module.exports = {
  DEFAULT_API_URL,
  chatCompletion,
  parseChatCompletionBody,
  extractMessageContent,
}
