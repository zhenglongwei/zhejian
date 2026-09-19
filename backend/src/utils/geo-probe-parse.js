/**
 * GEO-OBS-B04 · 解析探测答案中的 mention / citation
 */
const OWN_PUBLIC_HOSTS = ['zhejian.simplewin.cn', 'geo.simplewin.cn']

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function isOwnPublicHost(value) {
  const raw = String(value || '').toLowerCase()
  return OWN_PUBLIC_HOSTS.some((host) => raw.includes(host))
}

function normalizePublicHost(publicBaseUrl) {
  try {
    return new URL(publicBaseUrl).hostname.replace(/^www\./, '')
  } catch {
    return 'zhejian.simplewin.cn'
  }
}

/**
 * @param {string} text
 * @param {{ publicBaseUrl?: string }} [options]
 */
function parseProbeAnswer(text, options = {}) {
  const raw = String(text || '')
  const host = normalizePublicHost(options.publicBaseUrl || 'https://zhejian.simplewin.cn')
  const mentioned = raw.includes('辙见') || raw.includes(host) || isOwnPublicHost(raw)

  const urlMatches = raw.match(/https?:\/\/[^\s)\]"'<>]+/gi) || []
  const citedUrls = urlMatches.filter((url) => url.includes(host) || isOwnPublicHost(url))
  const externalDomains = [
    ...new Set(
      urlMatches
        .map(extractDomain)
        .filter((domain) => domain && domain !== host && !isOwnPublicHost(domain))
    ),
  ]

  return {
    mentioned,
    citedUrl: citedUrls[0] || '',
    citedUrls,
    externalDomains,
    usedOnly: mentioned && citedUrls.length === 0,
  }
}

module.exports = {
  parseProbeAnswer,
  normalizePublicHost,
  isOwnPublicHost,
}
