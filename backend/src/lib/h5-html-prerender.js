/**
 * 公开页服务端 HTML 拼装：全量请求可见 title / description / FAQ / JSON-LD。
 */
const { config } = require('../config')

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function absoluteUrl(pathname, baseUrl) {
  const base = String(baseUrl || config.publicBaseUrl).replace(/\/$/, '')
  const pathValue = String(pathname || '/')
  if (pathValue.startsWith('http')) return pathValue
  return `${base}${pathValue.startsWith('/') ? '' : '/'}${pathValue}`
}

function resolveRobotsContent(pageRobots) {
  if (config.isStagingPublicSite) return 'noindex,nofollow'
  return String(pageRobots || 'index,follow').trim() || 'index,follow'
}

function upsertMeta(html, attrName, key, content) {
  if (!content) return html
  const attr = attrName === 'property' ? 'property' : 'name'
  const re = new RegExp(`<meta ${attr}="${key}" content="[^"]*">`)
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}">`
  if (re.test(html)) return html.replace(re, tag)
  return html.replace('</head>', `  ${tag}\n</head>`)
}

function injectPrerenderHtml(template, payload = {}) {
  const {
    title,
    description,
    canonical,
    robots,
    bodyHtml,
    jsonLdBlocks,
    prerenderAttr = 'geo-html',
  } = payload

  let html = String(template || '')
  if (title) {
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
  }
  html = upsertMeta(html, 'name', 'description', description)
  html = upsertMeta(html, 'name', 'robots', resolveRobotsContent(robots))
  html = upsertMeta(html, 'property', 'og:title', title)
  html = upsertMeta(html, 'property', 'og:description', description)

  if (canonical) {
    const linkTag = `<link rel="canonical" href="${escapeHtml(canonical)}">`
    if (html.includes('rel="canonical"')) {
      html = html.replace(/<link rel="canonical" href="[^"]*">/, linkTag)
    } else {
      html = html.replace('</head>', `  ${linkTag}\n</head>`)
    }
  }

  const ldScripts = (jsonLdBlocks || [])
    .filter(Boolean)
    .map(
      (block, index) =>
        `<script type="application/ld+json" id="h5-prerender-ld-${index}">${JSON.stringify(block)}</script>`
    )
    .join('\n  ')
  if (ldScripts) {
    html = html.replace('</head>', `  ${ldScripts}\n</head>`)
  }

  html = html.replace(
    '<div id="app">加载中…</div>',
    `<div id="app"><div class="h5-bot-prerender" data-prerender="${escapeHtml(prerenderAttr)}">${bodyHtml || ''}</div></div>`
  )
  return html
}

function renderFaqSection(faq, heading = '常见问题') {
  const rows = (faq || []).filter((item) => item && (item.q || item.question) && (item.a || item.answer))
  if (!rows.length) return ''
  const items = rows
    .map((item) => {
      const q = escapeHtml(item.q || item.question)
      const a = escapeHtml(item.a || item.answer)
      return `<article><h3>${q}</h3><p>${a}</p></article>`
    })
    .join('')
  return `<section data-bot="faq" id="page-faq"><h2>${escapeHtml(heading)}</h2>${items}</section>`
}

function readH5Template(relativePath) {
  const fs = require('fs')
  const path = require('path')
  const h5Root = path.join(__dirname, '..', '..', '..', 'h5')
  return fs.readFileSync(path.join(h5Root, relativePath), 'utf8')
}

module.exports = {
  escapeHtml,
  absoluteUrl,
  resolveRobotsContent,
  injectPrerenderHtml,
  renderFaqSection,
  readH5Template,
}
