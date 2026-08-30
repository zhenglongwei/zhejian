const dns = require('dns').promises
const net = require('net')
const { pickOfficialSite, textMentionsName } = require('../utils/geo-check-classify')

const FETCH_TIMEOUT_MS = 8000
const MAX_BODY = 400 * 1024
const USER_AGENT = 'ZhejianGeoCheck/1.0 (+https://simplewin.cn/check.html)'

function isPrivateIp(ip) {
  if (net.isIP(ip) === 4) {
    const parts = ip.split('.').map(Number)
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
  }
  if (net.isIP(ip) === 6) {
    const lower = String(ip || '').toLowerCase()
    if (lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) {
      return true
    }
  }
  return false
}

function assertPublicHttpUrl(raw) {
  let parsed
  try {
    parsed = new URL(String(raw || ''))
  } catch {
    throw new Error('invalid_url')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported_protocol')
  const host = parsed.hostname.replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost') throw new Error('blocked_host')
  if (net.isIP(host) && isPrivateIp(host)) throw new Error('private_ip')
  return parsed
}

async function assertPublicHostname(hostname) {
  const { address } = await dns.lookup(hostname, { verbatim: true })
  if (isPrivateIp(address)) throw new Error('private_ip')
  return address
}

async function fetchText(url, timeoutMs) {
  const parsed = assertPublicHttpUrl(url)
  await assertPublicHostname(parsed.hostname)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs || FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(parsed.href, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain,application/xml,*/*' },
      signal: controller.signal,
    })
    const finalUrl = String(res.url || parsed.href)
    assertPublicHttpUrl(finalUrl)
    const buf = Buffer.from(await res.arrayBuffer())
    const text = buf.subarray(0, MAX_BODY).toString('utf8')
    return { ok: res.ok, status: res.status, url: finalUrl, text }
  } finally {
    clearTimeout(timer)
  }
}

function metaContent(html, name) {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    'i',
  )
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
    'i',
  )
  const match = String(html || '').match(re) || String(html || '').match(alt)
  return match ? match[1].trim() : ''
}

function extractTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match ? match[1].replace(/\s+/g, ' ').trim() : ''
}

function extractH1(html) {
  const match = String(html || '').match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  return match ? match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : ''
}

function extractJsonLdTypes(html) {
  const types = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = re.exec(String(html || '')))) {
    try {
      const data = JSON.parse(match[1])
      const nodes = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data]
      for (const node of nodes) {
        const t = node && node['@type']
        if (Array.isArray(t)) types.push(...t.map(String))
        else if (t) types.push(String(t))
      }
    } catch {
      /* ignore broken json-ld */
    }
  }
  return [...new Set(types)].slice(0, 12)
}

function robotsBlocksAll(text) {
  const raw = String(text || '')
  if (!raw.trim()) return false
  const star = raw.match(/user-agent:\s*\*([\s\S]*?)(?=user-agent:|$)/i)
  const block = star ? star[1] : raw
  return /^\s*disallow:\s*\/\s*$/im.test(block) && !/^\s*allow:\s*\/\s*$/im.test(block)
}

async function fetchOptional(origin, path) {
  try {
    const result = await fetchText(`${origin}${path}`, FETCH_TIMEOUT_MS)
    return {
      found: result.ok && Boolean(result.text.trim()),
      status: result.status,
      text: result.text,
    }
  } catch {
    return { found: false, status: 0, text: '' }
  }
}

async function auditOfficialSite(url, companyName) {
  try {
    const page = await fetchText(url, FETCH_TIMEOUT_MS)
    if (!page.ok) {
      return { status: 'error', url, reason: `http_${page.status}`, checks: [] }
    }
    const origin = new URL(page.url).origin
    const title = extractTitle(page.text)
    const description = metaContent(page.text, 'description') || metaContent(page.text, 'og:description')
    const h1 = extractH1(page.text)
    const jsonLdTypes = extractJsonLdTypes(page.text)
    const [robots, sitemap, llms] = await Promise.all([
      fetchOptional(origin, '/robots.txt'),
      fetchOptional(origin, '/sitemap.xml'),
      fetchOptional(origin, '/llms.txt'),
    ])
    const blocked = robotsBlocksAll(robots.text)
    const nameOk = textMentionsName(`${title} ${h1} ${description}`, companyName, '')
    const orgStructured = jsonLdTypes.some((t) =>
      /organization|localbusiness|automotivebusiness|website/i.test(t),
    )
    const checks = [
      { id: 'opens', label: '首页打得开', ok: true },
      { id: 'name', label: '标题或简介对得上企业名', ok: nameOk },
      { id: 'robots', label: '有 robots.txt', ok: robots.found },
      { id: 'sitemap', label: '有 sitemap.xml', ok: sitemap.found },
      { id: 'llms', label: '有 llms.txt', ok: llms.found },
      { id: 'jsonld', label: '有组织类结构化标记', ok: orgStructured },
      { id: 'not_blocked', label: '没有对全部爬虫一刀切拦截', ok: !blocked },
    ]
    const gaps = checks.filter((item) => !item.ok).map((item) => item.label.replace(/^有 /, '缺少'))
    return {
      status: 'ok',
      url: page.url,
      title: title.slice(0, 180),
      description: description.slice(0, 280),
      h1: h1.slice(0, 120),
      jsonLdTypes,
      robots: robots.found,
      sitemap: sitemap.found,
      llmsTxt: llms.found,
      blockedAllCrawlers: blocked,
      nameMatches: nameOk,
      checks,
      gaps,
    }
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'timeout' : error.message
    return { status: 'error', url, reason, checks: [] }
  }
}

async function inspectOfficialFromHits(hits, companyName) {
  const pick = pickOfficialSite(hits, companyName)
  if (!pick.chosen) {
    return {
      status: 'skipped',
      reason: pick.otherCandidates.length ? 'uncertain' : 'not_found',
      note: pick.otherCandidates.length
        ? '有几条像官网，但不够确定，没有自动打开，避免测错站。'
        : '检索结果里没有认定出官网。',
      chosen: null,
      otherCandidates: pick.otherCandidates,
      audit: null,
    }
  }
  const audit = await auditOfficialSite(pick.chosen.url, companyName)
  return {
    status: audit.status === 'ok' ? 'ok' : 'error',
    reason: audit.reason || '',
    note: `测的是 ${audit.url || pick.chosen.url}。只抽查公开页，不是整站扫描。`,
    chosen: pick.chosen,
    confidence: pick.confidence,
    otherCandidates: pick.otherCandidates,
    audit,
  }
}

module.exports = {
  inspectOfficialFromHits,
  auditOfficialSite,
  assertPublicHttpUrl,
  isPrivateIp,
  extractJsonLdTypes,
  robotsBlocksAll,
}
