/**
 * 卷十六 · 体检：网页来源打标、名称是否对得上
 */

const SOURCE_RULES = [
  {
    id: 'weixin',
    label: '公众号/微信',
    test: (host) => /(^|\.)weixin\.qq\.com$/i.test(host),
  },
  { id: 'zhihu', label: '知乎', test: (host) => /(^|\.)zhihu\.com$/i.test(host) },
  { id: 'sohu', label: '搜狐', test: (host) => /(^|\.)sohu\.com$/i.test(host) },
  { id: 'baike', label: '百科', test: (host) => /baike\.(baidu|so\.com)/i.test(host) },
  {
    id: 'media',
    label: '媒体',
    test: (host) =>
      /(qq\.com|163\.com|ifeng\.com|thepaper\.cn|people\.com\.cn|xinhuanet\.com|toutiao\.com|163\.com)$/i.test(
        host,
      ),
  },
]

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

function classifyHost(host) {
  const h = String(host || '').replace(/^www\./, '').toLowerCase()
  if (!h) return { id: 'other', label: '其他' }
  for (const rule of SOURCE_RULES) {
    if (rule.test(h)) return { id: rule.id, label: rule.label }
  }
  return { id: 'web', label: '网页' }
}

function classifySearchHit(hit) {
  const url = String(hit?.url || hit?.link || '').trim()
  const title = String(hit?.title || '').trim()
  const snippet = String(hit?.snippet || hit?.summary || hit?.content || '').trim()
  const host = hostnameOf(url)
  const source = classifyHost(host)
  return {
    url,
    title,
    snippet: snippet.slice(0, 280),
    host,
    sourceId: source.id,
    sourceLabel: source.label,
  }
}

function normalizeName(name) {
  return String(name || '')
    .replace(/有限公司|有限责任公司|股份有限公司|（[^）]+）|\([^)]+\)/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function textMentionsName(text, companyName, city) {
  const raw = String(text || '')
  const name = String(companyName || '').trim()
  if (!name) return false
  if (raw.includes(name)) return true
  const compact = normalizeName(name)
  const compactText = raw.replace(/\s+/g, '').toLowerCase()
  if (compact.length >= 2 && compactText.includes(compact)) return true
  const cityName = String(city || '').trim()
  if (cityName && raw.includes(cityName) && compact.length >= 2 && compactText.includes(compact)) {
    return true
  }
  return false
}

function groupHitsBySource(hits) {
  const groups = {}
  for (const hit of hits) {
    const key = hit.sourceId || 'other'
    if (!groups[key]) {
      groups[key] = { id: key, label: hit.sourceLabel || '其他', items: [] }
    }
    groups[key].items.push(hit)
  }
  return Object.values(groups)
}

function likelyOfficialHits(hits, companyName) {
  const name = normalizeName(companyName)
  if (name.length < 2) return []
  return hits.filter((hit) => {
    if (['zhihu', 'sohu', 'baike', 'media', 'weixin'].includes(hit.sourceId)) return false
    const blob = `${hit.title} ${hit.host} ${hit.snippet}`.replace(/\s+/g, '').toLowerCase()
    return blob.includes(name)
  })
}

function weixinHitsFromSources(sources) {
  return (sources || [])
    .map((item) =>
      classifySearchHit({
        url: item.url || item.link,
        title: item.title || item.name,
        snippet: item.snippet,
      }),
    )
    .filter((hit) => hit.sourceId === 'weixin' || /weixin\.qq\.com/i.test(hit.url))
}

module.exports = {
  hostnameOf,
  classifyHost,
  classifySearchHit,
  normalizeName,
  textMentionsName,
  groupHitsBySource,
  likelyOfficialHits,
  weixinHitsFromSources,
}
