const { config } = require('../config')
const { classifySearchHit, groupHitsBySource, likelyOfficialHits } = require('../utils/geo-check-classify')

/** 官方：content 限 72 个字符，一个汉字占两个字符，超长只取前 72。 */
function baiduQueryUnits(text) {
  let units = 0
  let out = ''
  for (const ch of String(text || '')) {
    const size = /[\u4e00-\u9fff]/.test(ch) ? 2 : 1
    if (units + size > 72) break
    units += size
    out += ch
  }
  return out.trim()
}

function baiduAuthHeaders(apiKey) {
  const token = `Bearer ${apiKey}`
  return {
    'Content-Type': 'application/json',
    Authorization: token,
    // 控制台 / curl 示例用这个头；HTTP 结构示例用 Authorization。两套都带，避免 Key 类型对不上。
    'X-Appbuilder-Authorization': token,
  }
}

function collectFromReferences(body) {
  const list = Array.isArray(body?.references) ? body.references : []
  return list
    .map((item) => ({
      url: String(item?.url || '').trim(),
      title: String(item?.title || item?.web_anchor || '').trim(),
      snippet: String(item?.snippet || item?.content || '').trim(),
    }))
    .filter((item) => item.url.startsWith('http'))
}

function collectRawHits(value, acc = [], depth = 0) {
  if (depth === 0 && value && Array.isArray(value.references)) {
    return collectFromReferences(value)
  }
  if (depth > 8 || acc.length >= 40) return acc
  if (!value) return acc
  if (Array.isArray(value)) {
    for (const item of value) collectRawHits(item, acc, depth + 1)
    return acc
  }
  if (typeof value !== 'object') return acc
  const url = String(value.url || value.link || value.source_url || '').trim()
  const title = String(value.title || value.name || '').trim()
  if (url.startsWith('http') && title) {
    acc.push(value)
    return acc
  }
  for (const key of Object.keys(value)) {
    if (['raw', 'choices', 'message'].includes(key)) continue
    collectRawHits(value[key], acc, depth + 1)
  }
  return acc
}

function finalizeHits(rawHits, query, companyName, provider, labelNote) {
  const hits = rawHits.map(classifySearchHit).filter((item) => item.url)
  const unique = []
  const seen = new Set()
  for (const hit of hits) {
    if (seen.has(hit.url)) continue
    seen.add(hit.url)
    unique.push(hit)
  }
  const sliced = unique.slice(0, 15)
  return {
    status: 'ok',
    provider,
    note: labelNote || '',
    query,
    hits: sliced,
    groups: groupHitsBySource(sliced),
    likelyOfficial: likelyOfficialHits(unique, companyName || query),
  }
}

async function searchViaQwen(query, timeoutMs, companyName) {
  const { probeWithEngine, resolveEngineRuntimeConfig } = require('./geo-probe-engines')
  const qwen = resolveEngineRuntimeConfig('qwen')
  if (!qwen?.apiKey) {
    return { status: 'unconfigured', reason: 'missing_web_search_key', query, hits: [], groups: [] }
  }
  const result = await probeWithEngine('qwen', `${query} 官网 地址`, {
    dryRun: false,
    enabled: true,
    timeoutMs: timeoutMs || 45000,
  })
  if (result.status !== 'ok') {
    return {
      status: result.status === 'skipped' ? 'unconfigured' : 'error',
      reason: result.reason || result.errorMessage || 'qwen_search_failed',
      query,
      hits: [],
      groups: [],
    }
  }
  const raw = (result.searchSources || []).map((item) => ({
    url: item.url,
    title: item.title || item.url,
    snippet: item.snippet || '',
  }))
  return finalizeHits(raw, query, companyName, 'qwen', '无百度网页搜索密钥，改用通义联网结果（不是百度）')
}

async function searchPublicWeb(query, timeoutMs, companyName) {
  const apiKey = config.geoCheck.baiduApiKey
  const apiUrl = config.geoCheck.baiduSearchUrl
  if (!apiKey) {
    return searchViaQwen(query, timeoutMs, companyName)
  }

  const content = baiduQueryUnits(query)
  const payload = {
    messages: [{ role: 'user', content }],
    search_source: 'baidu_search_v2',
    resource_type_filter: [{ type: 'web', top_k: 15 }],
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Number(timeoutMs) || 20000)
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: baiduAuthHeaders(apiKey),
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const body = await res.json().catch(() => ({}))
    const apiError = body.code || body.error_code || (!res.ok ? res.status : 0)
    if (apiError) {
      const reason = body.message || body.error_msg || body.error?.message || `HTTP ${res.status}`
      const fallback = await searchViaQwen(query, timeoutMs, companyName)
      if (fallback.status === 'ok' && fallback.hits.length) {
        return { ...fallback, note: `百度检索失败（${reason}），改用通义联网` }
      }
      return {
        status: 'error',
        reason,
        query: content,
        hits: [],
        groups: [],
      }
    }
    return finalizeHits(collectRawHits(body), content, companyName, 'baidu', '百度网页搜索')
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'timeout' : error.message
    if (reason === 'timeout') {
      return { status: 'error', reason, query: content, hits: [], groups: [] }
    }
    return searchViaQwen(query, timeoutMs, companyName)
  } finally {
    clearTimeout(timer)
  }
}

module.exports = {
  searchPublicWeb,
  searchBaiduWeb: searchPublicWeb,
  collectRawHits,
  baiduQueryUnits,
  baiduAuthHeaders,
}
