const { config } = require('../config')
const { textMentionsName } = require('../utils/geo-check-classify')

function isMapHost(host) {
  return /(amap\.com|gaode\.com|map\.baidu\.com|dianping\.com|meituan\.com)$/i.test(String(host || ''))
}

function inferMapFromWebHits(hits, keywords, city) {
  const items = (hits || [])
    .filter((hit) => isMapHost(hit.host))
    .slice(0, 8)
    .map((hit) => ({
      name: hit.title || '',
      address: hit.snippet || '',
      city: city || '',
      type: hit.host,
      url: hit.url,
      nameMatches: textMentionsName(`${hit.title || ''} ${hit.snippet || ''}`, keywords, city),
    }))
  const matched = items.filter((item) => item.nameMatches)
  if (!items.length) {
    return {
      status: 'unconfigured',
      reason: 'missing_amap_key',
      note: '未配置高德地点检索。网页结果里也没有地图链接。',
      items: [],
      found: false,
      matchedName: false,
    }
  }
  return {
    status: 'ok',
    provider: 'web_fallback',
    note: matched.length
      ? '未配置高德密钥，从网页结果里的地图/到店链接推断'
      : '网页里有地图链接，但名称对不上所查企业',
    found: matched.length > 0,
    matchedName: matched.length > 0,
    droppedUnrelated: items.length - matched.length,
    items: matched,
  }
}

async function searchAmapPlace(keywords, city, timeoutMs, webHits) {
  const key = config.geoCheck.amapKey
  if (!key) {
    return inferMapFromWebHits(webHits || [], keywords, city)
  }

  const params = new URLSearchParams({
    key,
    keywords: String(keywords || '').trim(),
    region: String(city || '').trim(),
  })
  const url = `https://restapi.amap.com/v5/place/text?${params.toString()}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Number(timeoutMs) || 12000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    const body = await res.json().catch(() => ({}))
    if (String(body.status) !== '1') {
      return {
        status: 'error',
        reason: body.info || body.infocode || `HTTP ${res.status}`,
        items: [],
      }
    }
    const pois = Array.isArray(body.pois) ? body.pois : []
    const items = pois.slice(0, 8).map((poi) => ({
      name: String(poi.name || ''),
      address: String(poi.address || ''),
      city: String(poi.cityname || poi.city || ''),
      type: String(poi.type || ''),
      nameMatches: textMentionsName(`${poi.name || ''} ${poi.address || ''}`, keywords, city),
    }))
    const matched = items.filter((item) => item.nameMatches)
    return {
      status: 'ok',
      found: matched.length > 0,
      matchedName: matched.length > 0,
      droppedUnrelated: items.length - matched.length,
      note: items.length && !matched.length ? '地图有点，但名称对不上所查企业' : '',
      items: matched,
    }
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'timeout' : error.message
    return { status: 'error', reason, items: [] }
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { searchAmapPlace, inferMapFromWebHits }
