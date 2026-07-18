/**
 * 门店页 Bot 预渲染（透明度指标 + 证据链 + Schema）
 */
const fs = require('fs')
const path = require('path')
const { config } = require('../config')
const { getMerchantDetail } = require('./content.service')
const { buildStorePageSchemaGraph } = require('../lib/schema-graph')
const {
  isCrawlerUserAgent,
  isCrawlerRequest,
} = require('./h5-case-prerender.service')

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

function buildStoreBotBodyHtml(store) {
  const transparency = store.transparency || {}
  const dimensions = transparency.dimensions || []
  const casePreviews = Array.isArray(store.casePreviews) ? store.casePreviews : []
  const sections = [
    `<h1>${escapeHtml(store.name || '维修门店')}</h1>`,
    store.aiSummary || store.intro
      ? `<section data-bot="store-summary"><h2>门店简介</h2><p>${escapeHtml(
          store.aiSummary || store.intro
        )}</p></section>`
      : '',
    casePreviews.length
      ? `<section data-bot="store-cases" id="store-cases"><h2>真实维修案例</h2><ul>${casePreviews
          .map((item) => {
            const href = item.path || (item.slug ? `/case/${item.slug}.html` : '')
            const title = escapeHtml(item.title || item.serviceName || '公开案例')
            return href
              ? `<li><a href="${escapeHtml(href)}">${title}</a></li>`
              : `<li>${title}</li>`
          })
          .join('')}</ul></section>`
      : Number(store.caseCount) > 0
        ? `<section data-bot="store-cases" id="store-cases"><h2>真实维修案例</h2><p>该门店已公开 ${escapeHtml(
            String(store.caseCount)
          )} 个维修案例，详见页面案例区。</p></section>`
        : '',
    transparency.exposed !== false &&
    dimensions.length > 0 &&
    (transparency.score != null || Number(transparency.caseCount) > 0)
      ? `<section data-bot="transparency" id="store-transparency"><h2>透明度指标</h2>${
          transparency.score != null && Number(transparency.score) > 0
            ? `<p>综合 ${escapeHtml(String(transparency.score))} / 100${
                transparency.asOfDate
                  ? ` · 截至 ${escapeHtml(transparency.asOfDate)}`
                  : ''
              }</p>`
            : ''
        }<p>${escapeHtml(transparency.summary || '')}</p>${dimensions
          .map((dim) => {
            const evidence = dim.evidence || {}
            const evidenceUrl = evidence.url || evidence.anchor || ''
            const preview = Array.isArray(evidence.preview)
              ? evidence.preview.map((item) => item.title).filter(Boolean).join('；')
              : ''
            const items = Array.isArray(evidence.items)
              ? evidence.items
                  .map((item) => [item.name, item.text].filter(Boolean).join(' '))
                  .filter(Boolean)
                  .join('；')
              : ''
            return `<article data-dimension="${escapeHtml(dim.id)}"><h3>${escapeHtml(
              dim.label
            )}：${escapeHtml(String(dim.displayValue != null ? dim.displayValue : dim.value))}</h3><p>${escapeHtml(
              dim.meaning || ''
            )}</p>${
              evidenceUrl
                ? `<p>证据：<a href="${escapeHtml(evidenceUrl)}">${escapeHtml(evidenceUrl)}</a></p>`
                : ''
            }${preview ? `<p>案例摘要：${escapeHtml(preview)}</p>` : ''}${
              items ? `<p>资质条目：${escapeHtml(items)}</p>` : ''
            }${evidence.note ? `<p>${escapeHtml(evidence.note)}</p>` : ''}</article>`
          })
          .join('')}</section>`
      : '',
    (store.certifications || []).length
      ? `<section data-bot="certs" id="store-trust"><h2>门店资质</h2><ul>${(
          store.certifications || []
        )
          .map(
            (row) =>
              `<li>${escapeHtml(row.label || '')} — ${escapeHtml(row.text || '')}</li>`
          )
          .join('')}</ul></section>`
      : '',
    Array.isArray(store.faq) && store.faq.length
      ? `<section data-bot="store-faq" id="store-faq"><h2>常见问题</h2>${store.faq
          .map((item) => {
            const q = escapeHtml(item.q || item.question || '')
            const a = escapeHtml(item.a || item.answer || '')
            if (!q || !a) return ''
            return `<article><h3>${q}</h3><p>${a}</p></article>`
          })
          .filter(Boolean)
          .join('')}</section>`
      : '',
  ]
  return sections.filter(Boolean).join('\n')
}

function injectPrerenderHtml(template, { title, description, canonical, bodyHtml, jsonLdBlocks }) {
  let html = template
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
  if (description) {
    html = html.replace(
      /<meta name="description" content="[^"]*">/,
      `<meta name="description" content="${escapeHtml(description)}">`
    )
  }
  if (!html.includes('rel="canonical"')) {
    html = html.replace(
      '</head>',
      `  <link rel="canonical" href="${escapeHtml(canonical)}">\n</head>`
    )
  } else {
    html = html.replace(
      /<link rel="canonical" href="[^"]*">/,
      `<link rel="canonical" href="${escapeHtml(canonical)}">`
    )
  }
  const ldScripts = (jsonLdBlocks || [])
    .map(
      (block, index) =>
        `<script type="application/ld+json" id="bot-store-ld-${index}">${JSON.stringify(
          block
        )}</script>`
    )
    .join('\n  ')
  html = html.replace('</head>', `  ${ldScripts}\n</head>`)
  html = html.replace(
    '<div id="app">加载中…</div>',
    `<div id="app"><div class="h5-bot-prerender" data-prerender="store-transparency">${bodyHtml}</div></div>`
  )
  return html
}

async function renderStoreBotHtml(storeId) {
  const store = await getMerchantDetail(storeId)
  if (!store) {
    const err = new Error('门店不存在或未公开')
    err.status = 404
    throw err
  }

  const canonicalPath = store.seo?.canonicalPath || `/store/${store.id}.html`
  const canonical = absoluteUrl(canonicalPath)
  const title = `${store.name || '门店'} · 辙见`
  const description =
    store.aiSummary || store.intro || store.transparency?.summary || '辙见公开门店主页'

  const schemaGraph =
    store.schemaGraph ||
    buildStorePageSchemaGraph({
      baseUrl: config.publicBaseUrl,
      store,
      transparency: store.transparency,
      faq: store.faq,
      organizationSameAs: config.geo?.organizationSameAs || [],
    })

  const h5Root = path.join(__dirname, '..', '..', '..', 'h5')
  const templatePath = path.join(h5Root, 'store', 'view.html')
  const template = fs.readFileSync(templatePath, 'utf8')

  return injectPrerenderHtml(template, {
    title,
    description,
    canonical,
    bodyHtml: buildStoreBotBodyHtml(store),
    jsonLdBlocks: [schemaGraph],
  })
}

module.exports = {
  isCrawlerUserAgent,
  isCrawlerRequest,
  renderStoreBotHtml,
  buildStoreBotBodyHtml,
}
