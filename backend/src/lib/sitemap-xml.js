function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatSitemapDate(input) {
  if (!input) return new Date().toISOString().slice(0, 10)
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  return date.toISOString().slice(0, 10)
}

/**
 * @param {{ loc: string, lastmod?: string|Date, changefreq?: string, priority?: string }[]} entries
 */
function renderUrlSet(entries) {
  const urls = (entries || [])
    .filter((entry) => entry && entry.loc)
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.loc)}</loc>`]
      if (entry.lastmod) {
        parts.push(`    <lastmod>${formatSitemapDate(entry.lastmod)}</lastmod>`)
      }
      if (entry.changefreq) {
        parts.push(`    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`)
      }
      if (entry.priority) {
        parts.push(`    <priority>${escapeXml(entry.priority)}</priority>`)
      }
      return `  <url>\n${parts.join('\n')}\n  </url>`
    })
    .join('\n')

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls +
    '\n</urlset>\n'
  )
}

/**
 * @param {{ loc: string, lastmod?: string|Date }[]} sitemaps
 */
function renderSitemapIndex(sitemaps) {
  const items = (sitemaps || [])
    .filter((entry) => entry && entry.loc)
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.loc)}</loc>`]
      if (entry.lastmod) {
        parts.push(`    <lastmod>${formatSitemapDate(entry.lastmod)}</lastmod>`)
      }
      return `  <sitemap>\n${parts.join('\n')}\n  </sitemap>`
    })
    .join('\n')

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    items +
    '\n</sitemapindex>\n'
  )
}

module.exports = {
  escapeXml,
  formatSitemapDate,
  renderUrlSet,
  renderSitemapIndex,
}
