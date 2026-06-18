/**
 * GEO-OBS-B04 · 解析探测答案中的 mention / citation
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function normalizePublicHost(publicBaseUrl) {
  try {
    return new URL(publicBaseUrl).hostname.replace(/^www\./, '')
  } catch {
    return 'geo.simplewin.cn'
  }
}

/**
 * @param {string} text
 * @param {{ publicBaseUrl?: string }} [options]
 */
function parseProbeAnswer(text, options = {}) {
  const raw = String(text || '')
  const host = normalizePublicHost(options.publicBaseUrl || 'https://geo.simplewin.cn')
  const mentioned =
    raw.includes('辙见') ||
    raw.includes(host) ||
    raw.includes('geo.simplewin.cn')

  const urlMatches = raw.match(/https?:\/\/[^\s)\]"'<>]+/gi) || []
  const citedUrls = urlMatches.filter((url) => url.includes(host) || url.includes('geo.simplewin.cn'))
  const externalDomains = [
    ...new Set(
      urlMatches
        .map(extractDomain)
        .filter((domain) => domain && domain !== host && !domain.includes('geo.simplewin.cn'))
    ),
  ]

  return {
    mentioned,
    citedUrl: citedUrls[0] || '',
    citedUrls,
    externalDomains,
  }
}

module.exports = {
  parseProbeAnswer,
  normalizePublicHost,
}
