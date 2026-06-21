/**
 * GEO-OBS-D · 联网探测 Chat 调用（模拟用户开启联网问答）
 */
const {
  chatCompletion,
  extractMessageContent,
  parseChatCompletionBody,
} = require('../../lib/dashscope-chat')

const KIMI_WEB_SEARCH_TOOLS = [
  {
    type: 'builtin_function',
    function: { name: '$web_search' },
  },
]

function resolveApiError(body, status) {
  return (
    body?.error?.message ||
    body?.message ||
    (body?.code ? `${body.code}: ${body.message || ''}` : '') ||
    `HTTP ${status}`
  )
}

/**
 * @param {{
 *   apiUrl: string,
 *   apiKey: string,
 *   payload: object,
 *   timeoutMs?: number,
 * }} options
 */
async function postJson(options) {
  const controller = new AbortController()
  const timeoutMs = Number(options.timeoutMs) || 120000
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(String(options.apiUrl).trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${String(options.apiKey || '').trim()}`,
      },
      body: JSON.stringify(options.payload || {}),
      signal: controller.signal,
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(resolveApiError(body, res.status))
      err.status = res.status
      err.body = body
      throw err
    }
    return body
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

/**
 * @param {unknown} value
 * @returns {Array<{ url?: string, title?: string, snippet?: string }>}
 */
function collectSearchSources(value) {
  /** @type {Array<{ url?: string, title?: string, snippet?: string }>} */
  const sources = []
  const seen = new Set()

  function pushSource(item) {
    if (!item || typeof item !== 'object') return
    const url = String(item.url || item.link || item.source_url || item.href || '').trim()
    if (!url || seen.has(url)) return
    seen.add(url)
    sources.push({
      url,
      title: String(item.title || item.name || '').trim(),
      snippet: String(item.snippet || item.summary || item.content || '').trim(),
    })
  }

  function walk(node) {
    if (!node) return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node !== 'object') return

    if (Array.isArray(node.search_results)) node.search_results.forEach(pushSource)
    if (Array.isArray(node.references)) node.references.forEach(pushSource)
    if (Array.isArray(node.search_info?.search_results)) {
      node.search_info.search_results.forEach(pushSource)
    }
    if (node.url || node.link) pushSource(node)

    Object.values(node).forEach(walk)
  }

  walk(value)
  return sources
}

/**
 * @param {unknown} output
 */
function extractResponsesApiText(output) {
  const chunks = []

  function walk(node) {
    if (!node) return
    if (typeof node === 'string') {
      if (node.trim()) chunks.push(node.trim())
      return
    }
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node !== 'object') return

    if (node.type === 'output_text' && node.text) {
      chunks.push(String(node.text))
      return
    }
    if (node.type === 'message' && Array.isArray(node.content)) {
      node.content.forEach(walk)
      return
    }
    if (node.text && typeof node.text === 'string') {
      chunks.push(node.text)
    }
    if (node.content) walk(node.content)
    if (node.output) walk(node.output)
  }

  walk(output)
  return [...new Set(chunks.filter(Boolean))].join('\n')
}

/**
 * @param {{ apiUrl: string, apiKey: string, model: string, messages: object[], timeoutMs?: number, enableThinking?: boolean, searchOptions?: object }} options
 */
async function chatQwenWithWebSearch(options) {
  const payload = {
    model: options.model,
    messages: options.messages,
    temperature: 0.2,
    enable_search: true,
    search_options: {
      forced_search: true,
      enable_source: true,
      ...(options.searchOptions || {}),
    },
  }
  if (options.enableThinking === false) payload.enable_thinking = false
  if (options.enableThinking === true) payload.enable_thinking = true

  const body = await postJson({
    apiUrl: options.apiUrl,
    apiKey: options.apiKey,
    payload,
    timeoutMs: options.timeoutMs,
  })
  const parsed = parseChatCompletionBody(body)
  return {
    text: parsed.text,
    searchSources: collectSearchSources(body),
    raw: body,
  }
}

/**
 * @param {{ apiUrl: string, apiKey: string, model: string, messages: object[], timeoutMs?: number }} options
 */
async function chatResponsesWebSearch(options) {
  const body = await postJson({
    apiUrl: options.apiUrl,
    apiKey: options.apiKey,
    payload: {
      model: options.model,
      input: options.messages,
      tools: [{ type: 'web_search' }],
      stream: false,
    },
    timeoutMs: options.timeoutMs,
  })

  return {
    text: extractResponsesApiText(body.output || body),
    searchSources: collectSearchSources(body),
    raw: body,
  }
}

/** @deprecated 别名，与 chatResponsesWebSearch 相同 */
async function chatDoubaoResponsesWebSearch(options) {
  return chatResponsesWebSearch(options)
}

/**
 * @param {{ apiUrl: string, apiKey: string, model: string, messages: object[], timeoutMs?: number }} options
 */
async function chatKimiBuiltinWebSearch(options) {
  /** @type {object[]} */
  const messages = [...options.messages]
  const maxRounds = 4
  let lastBody = null

  for (let round = 0; round < maxRounds; round += 1) {
    const body = await postJson({
      apiUrl: options.apiUrl,
      apiKey: options.apiKey,
      payload: {
        model: options.model,
        messages,
        temperature: 0.2,
        tools: KIMI_WEB_SEARCH_TOOLS,
        thinking: { type: 'disabled' },
      },
      timeoutMs: options.timeoutMs,
    })
    lastBody = body

    const choice = body?.choices?.[0]
    const finishReason = choice?.finish_reason
    const message = choice?.message || {}

    if (finishReason === 'tool_calls' && Array.isArray(message.tool_calls) && message.tool_calls.length) {
      messages.push(message)
      for (const toolCall of message.tool_calls) {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: String(toolCall.function?.arguments || '{}'),
        })
      }
      continue
    }

    return {
      text: extractMessageContent(message),
      searchSources: collectSearchSources(body),
      raw: body,
    }
  }

  const fallbackMessage = lastBody?.choices?.[0]?.message
  return {
    text: extractMessageContent(fallbackMessage),
    searchSources: collectSearchSources(lastBody),
    raw: lastBody,
  }
}

/**
 * @param {{ apiUrl: string, apiKey: string, model: string, messages: object[], timeoutMs?: number }} options
 */
async function chatWenxinWebSearch(options) {
  const body = await postJson({
    apiUrl: options.apiUrl,
    apiKey: options.apiKey,
    payload: {
      model: options.model,
      messages: options.messages,
      temperature: 0.2,
      web_search: {
        enable: true,
        enable_trace: true,
        enable_citation: true,
      },
    },
    timeoutMs: options.timeoutMs,
  })
  const parsed = parseChatCompletionBody(body)
  return {
    text: parsed.text,
    searchSources: collectSearchSources(body),
    raw: body,
  }
}

/**
 * @param {{
 *   webSearchMode: string,
 *   apiUrl: string,
 *   apiKey: string,
 *   model: string,
 *   prompt: string,
 *   timeoutMs?: number,
 *   enableThinking?: boolean,
 * }} options
 */
async function chatWithWebSearch(options) {
  const base = {
    apiUrl: options.apiUrl,
    apiKey: options.apiKey,
    model: options.model,
    messages: [{ role: 'user', content: options.prompt }],
    timeoutMs: options.timeoutMs,
    enableThinking: options.enableThinking,
  }

  switch (options.webSearchMode) {
    case 'enable_search':
      return chatQwenWithWebSearch(base)
    case 'responses_web_search':
      return chatResponsesWebSearch(base)
    case 'builtin_web_search':
      return chatKimiBuiltinWebSearch(base)
    case 'web_search_object':
      return chatWenxinWebSearch(base)
    default:
      throw new Error(`unsupported_web_search_mode:${options.webSearchMode}`)
  }
}

module.exports = {
  chatWithWebSearch,
  collectSearchSources,
  extractResponsesApiText,
  KIMI_WEB_SEARCH_TOOLS,
}
