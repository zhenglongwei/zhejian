/**
 * 门店页服务端 HTML（透明度指标 + 证据链 + Schema）
 */
const { config } = require('../config')
const { getMerchantDetail } = require('./content.service')
const { buildStorePageSchemaGraph } = require('../lib/schema-graph')
const {
  isCrawlerUserAgent,
  isCrawlerRequest,
} = require('./h5-case-prerender.service')
const { renderSiteBeianHtml } = require('../lib/site-beian')
const {
  escapeHtml,
  absoluteUrl,
  injectPrerenderHtml,
  readH5Template,
} = require('../lib/h5-html-prerender')

function buildStoreBotBodyHtml(store) {
  const transparency = store.transparency || {}
  const dimensions = transparency.dimensions || []
  const casePreviews = Array.isArray(store.casePreviews) ? store.casePreviews : []
  const sections = [
    `<h1>${escapeHtml(store.name || '维修门店')}</h1>`,
    store.city || store.address || store.businessHours || (store.latitude != null && store.longitude != null)
      ? `<section data-bot="store-nap"><h2>门店信息</h2><ul>${[
          store.name ? `<li>对外门店名：${escapeHtml(store.name)}</li>` : '',
          store.city ? `<li>城市：${escapeHtml(store.city)}</li>` : '',
          store.address ? `<li>地址：${escapeHtml(store.address)}</li>` : '',
          store.businessHours ? `<li>营业时间：${escapeHtml(store.businessHours)}</li>` : '',
          store.latitude != null && store.longitude != null
            ? `<li>坐标：${escapeHtml(String(store.latitude))}, ${escapeHtml(String(store.longitude))}</li>`
            : '',
        ]
          .filter(Boolean)
          .join('')}</ul></section>`
      : '',
    store.aiSummary || store.intro
      ? `<section data-bot="store-summary"><h2>门店简介</h2><p>${escapeHtml(
          store.aiSummary || store.intro
        )}</p></section>`
      : '',
    casePreviews.length
      ? `<section data-bot="store-cases" id="store-cases"><h2>公开档案</h2><ul>${casePreviews
          .map((item) => {
            const href = item.path || (item.slug ? `/case/${item.slug}.html` : '')
            const title = escapeHtml(item.title || item.serviceName || '公开案例')
            return href
              ? `<li><a href="${escapeHtml(href)}">${title}</a></li>`
              : `<li>${title}</li>`
          })
          .join('')}</ul></section>`
      : Number(store.caseCount) > 0
        ? `<section data-bot="store-cases" id="store-cases"><h2>公开档案</h2><p>该门店已公开 ${escapeHtml(
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
    renderSiteBeianHtml(),
  ]
  return sections.filter(Boolean).join('\n')
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
      organizationSameAs: config.geo?.organizationSameAs || [],
    })

  return injectPrerenderHtml(readH5Template('store/view.html'), {
    title,
    description,
    canonical,
    robots: store.seo?.robots || (store.seo?.noindex ? 'noindex,follow' : 'index,follow'),
    bodyHtml: buildStoreBotBodyHtml(store),
    jsonLdBlocks: [schemaGraph],
    prerenderAttr: 'store-transparency',
  })
}

module.exports = {
  isCrawlerUserAgent,
  isCrawlerRequest,
  renderStoreBotHtml,
  buildStoreBotBodyHtml,
}
