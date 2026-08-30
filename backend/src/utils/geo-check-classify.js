/**
 * 卷十六 · 体检：网页来源打标、名称是否对得上
 */

const SOURCE_RULES = [
  {
    id: 'weixin',
    label: '公众号/微信',
    test: (host) => /(^|\.)weixin\.qq\.com$/i.test(host),
  },
  {
    id: 'bytedance',
    label: '抖音/头条',
    test: (host) =>
      /(douyin|iesdouyin|toutiao|ixigua|huoshan|jinritemai|dongchedi|snssdk|bytedance)/i.test(host),
  },
  {
    id: 'alibaba',
    label: '阿里系',
    test: (host) =>
      /(alibaba|1688\.com|taobao|tmall|aliyun|alibabacloud|youku|\.uc\.cn|amap\.com|gaode|ele\.me|fliggy|cainiao|dingtalk|alipay|goofish)/i.test(
        host,
      ),
  },
  { id: 'zhihu', label: '知乎', test: (host) => /(^|\.)zhihu\.com$/i.test(host) },
  { id: 'sohu', label: '搜狐', test: (host) => /(^|\.)sohu\.com$/i.test(host) },
  { id: 'baike', label: '百科', test: (host) => /baike\.(baidu|so\.com)/i.test(host) },
  {
    id: 'media',
    label: '媒体',
    test: (host) =>
      /(qq\.com|163\.com|ifeng\.com|thepaper\.cn|people\.com\.cn|xinhuanet\.com)$/i.test(host),
  },
]

const ECOSYSTEMS = {
  alibaba: {
    id: 'alibaba',
    label: '阿里系站点',
    sourceIds: ['alibaba'],
    hostTest: (host) => SOURCE_RULES.find((r) => r.id === 'alibaba').test(host),
  },
  tencent: {
    id: 'tencent',
    label: '腾讯系站点',
    sourceIds: ['weixin'],
    hostTest: (host) => /(weixin\.qq\.com|(^|\.)qq\.com$|qpic\.cn|tencent\.com)/i.test(host),
  },
  bytedance: {
    id: 'bytedance',
    label: '字节系站点',
    sourceIds: ['bytedance'],
    hostTest: (host) => SOURCE_RULES.find((r) => r.id === 'bytedance').test(host),
  },
}

const NOT_OFFICIAL_SOURCE = new Set(['zhihu', 'sohu', 'baike', 'media', 'weixin', 'bytedance', 'alibaba'])
const NOT_OFFICIAL_HOST =
  /(qcc\.com|tianyancha|aiqicha|qixin\.com|11467|dianping|meituan|amap\.com|map\.baidu|gsxt\.|tyc\.com|baike\.)/i

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
    if (NOT_OFFICIAL_SOURCE.has(hit.sourceId)) return false
    if (NOT_OFFICIAL_HOST.test(hit.host)) return false
    const blob = `${hit.title} ${hit.host} ${hit.snippet}`.replace(/\s+/g, '').toLowerCase()
    return blob.includes(name)
  })
}

function officialSiteScore(hit, companyName) {
  if (!hitMentionsCompany(hit, companyName)) return -1
  if (NOT_OFFICIAL_SOURCE.has(hit.sourceId)) return -1
  if (NOT_OFFICIAL_HOST.test(hit.host)) return -1
  let score = 1
  const title = String(hit.title || '')
  const snippet = String(hit.snippet || '')
  if (/官网|官方网站|官方首页/.test(title)) score += 4
  if (/官网/.test(snippet)) score += 1
  try {
    const path = new URL(hit.url).pathname.replace(/\/+$/, '') || '/'
    if (path === '/') score += 2
  } catch {
    /* ignore */
  }
  return score
}

function pickOfficialSite(hits, companyName) {
  const scored = (hits || [])
    .map((hit) => ({ hit, score: officialSiteScore(hit, companyName) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)
  const auto = scored.find((item) => item.score >= 4)
  const uniqueMedium = !auto && scored.length === 1 && scored[0].score >= 3 ? scored[0] : null
  const chosen = auto || uniqueMedium || null
  return {
    chosen: chosen ? chosen.hit : null,
    confidence: !chosen ? 'none' : chosen.score >= 6 ? 'high' : chosen.score >= 4 ? 'medium' : 'low',
    otherCandidates: scored
      .filter((item) => item.hit !== chosen?.hit)
      .slice(0, 5)
      .map((item) => item.hit),
  }
}

function hitInEcosystem(hit, ecosystemId) {
  const eco = ECOSYSTEMS[ecosystemId]
  if (!eco || !hit) return false
  if (eco.sourceIds.includes(hit.sourceId)) return true
  return eco.hostTest(hit.host || '')
}

function decodeUrlLoose(url) {
  try {
    return decodeURIComponent(String(url || '').replace(/\+/g, ' '))
  } catch {
    return String(url || '')
  }
}

function hitMentionsCompany(hit, companyName) {
  const name = String(companyName || '').trim()
  if (!name) return false
  const blob = [hit.title, hit.snippet, hit.host, decodeUrlLoose(hit.url)].filter(Boolean).join(' ')
  return textMentionsName(blob, name, '')
}

function filterHitsByCompanyName(hits, companyName) {
  const matched = []
  const dropped = []
  for (const hit of hits || []) {
    if (hitMentionsCompany(hit, companyName)) matched.push(hit)
    else dropped.push(hit)
  }
  return { matched, dropped }
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
  hitMentionsCompany,
  filterHitsByCompanyName,
  officialSiteScore,
  pickOfficialSite,
  hitInEcosystem,
  ECOSYSTEMS,
}
