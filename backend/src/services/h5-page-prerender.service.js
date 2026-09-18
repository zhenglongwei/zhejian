/**
 * 首页 / 服务 / 城市 / 专题 · 全量请求服务端 HTML
 */
const { config } = require('../config')
const { getHomePayload } = require('./home.service')
const { getServiceItemPagePayload } = require('./h5-service-item.service')
const { getCityPagePayload } = require('./h5-city.service')
const { getPublicTopicPagePayload } = require('./h5-geo-topic.service')
const { buildServicePageSchemaGraph, buildFaqNode, buildHomePageSchemaGraph } = require('../lib/schema-graph')
const {
  escapeHtml,
  absoluteUrl,
  injectPrerenderHtml,
  renderFaqSection,
  readH5Template,
} = require('../lib/h5-html-prerender')
const { renderSiteBeianHtml } = require('../lib/site-beian')

function notFound(message) {
  const err = new Error(message)
  err.status = 404
  return err
}

function listLinks(items, hrefFn, labelFn) {
  const rows = (items || []).filter(Boolean)
  if (!rows.length) return ''
  return `<ul>${rows
    .map((item) => {
      const href = hrefFn(item)
      const label = escapeHtml(labelFn(item))
      return href
        ? `<li><a href="${escapeHtml(href)}">${label}</a></li>`
        : `<li>${label}</li>`
    })
    .join('')}</ul>`
}

function buildWebPageGraph({ canonicalPath, title, description, faq }) {
  const organization = {
    '@type': 'Organization',
    '@id': `${config.publicBaseUrl.replace(/\/$/, '')}/#organization`,
    name: '辙见',
  }
  const graph = [
    organization,
    {
      '@type': 'WebPage',
      '@id': absoluteUrl(canonicalPath),
      name: title,
      description,
      url: absoluteUrl(canonicalPath),
      isPartOf: { '@id': organization['@id'] },
    },
  ]
  const faqNode = buildFaqNode(faq)
  if (faqNode) graph.push(faqNode)
  return { '@context': 'https://schema.org', '@graph': graph }
}

async function renderHomeHtml() {
  const data = await getHomePayload()
  const title = '辙见案例站'
  const description = '辙见案例站 · 维修案例托管库。查看门店公开的维修档案。'
  const canonical = absoluteUrl('/')
  const bodyHtml = [
    `<h1>维修案例托管库</h1>`,
    `<section data-bot="ai-summary"><h2>站点说明</h2><p>${escapeHtml(description)}</p></section>`,
    data.serviceEntries && data.serviceEntries.length
      ? `<section><h2>服务项目</h2>${listLinks(
          data.serviceEntries,
          (item) => item.h5Path || `/service/${item.slug || ''}.html`,
          (item) => item.name || item.title || '服务'
        )}</section>`
      : '',
    data.cityEntries && data.cityEntries.length
      ? `<section><h2>城市</h2>${listLinks(
          data.cityEntries,
          (item) => item.path || `/city/${item.slug}`,
          (item) => item.name || item.label || '城市'
        )}</section>`
      : '',
    data.featuredCases && data.featuredCases.length
      ? `<section><h2>公开案例</h2>${listLinks(
          data.featuredCases,
          (item) =>
            item.slug ? `/case/${item.slug}.html` : `/case/view.html?id=${item.id}`,
          (item) => item.title || item.serviceName || '公开案例'
        )}</section>`
      : '',
    data.geoTopics && data.geoTopics.length
      ? `<section><h2>本地专题</h2>${listLinks(
          data.geoTopics,
          (item) => item.h5Path || `/topic/${item.slug}`,
          (item) => item.title || item.slug
        )}</section>`
      : '',
    renderSiteBeianHtml(),
  ]
    .filter(Boolean)
    .join('\n')

  return injectPrerenderHtml(readH5Template('index.html'), {
    title,
    description,
    canonical,
    robots: 'index,follow',
    bodyHtml,
    prerenderAttr: 'home',
    jsonLdBlocks: [
      buildHomePageSchemaGraph({
        baseUrl: config.publicBaseUrl,
        organizationSameAs: config.geo?.organizationSameAs || [],
      }),
    ],
  })
}

async function renderServiceHtml(slug, query = {}) {
  const data = await getServiceItemPagePayload(slug, query)
  if (!data || !data.item) throw notFound('服务不存在')
  const item = data.item
  const seo = data.seo || {}
  const title = seo.title || `${item.name} · 辙见`
  const description = seo.description || item.aiSummary || item.summary || ''
  const canonical = absoluteUrl(seo.canonicalPath || `/service/${item.slug}.html`)
  const faq = data.faq || []
  const bodyHtml = [
    `<h1>${escapeHtml(item.name || '服务项目')}</h1>`,
    item.aiSummary || item.summary
      ? `<section data-bot="ai-summary"><h2>服务说明</h2><p>${escapeHtml(
          item.aiSummary || item.summary
        )}</p></section>`
      : '',
    renderFaqSection(faq),
    (data.featuredCases || []).length
      ? `<section><h2>相关案例</h2>${listLinks(
          data.featuredCases,
          (row) => (row.slug ? `/case/${row.slug}.html` : `/case/view.html?id=${row.id}`),
          (row) => row.title || row.serviceName || '公开案例'
        )}</section>`
      : '',
    renderSiteBeianHtml(),
  ]
    .filter(Boolean)
    .join('\n')

  const schemaGraph =
    data.schemaGraph ||
    buildServicePageSchemaGraph({
      baseUrl: config.publicBaseUrl,
      item,
      seo,
      geo: data.geo,
      faq,
      aggregateStats: data.aggregateStats,
      organizationSameAs: config.geo?.organizationSameAs || [],
    })

  return injectPrerenderHtml(readH5Template('service/view.html'), {
    title,
    description,
    canonical,
    robots: seo.robots,
    bodyHtml,
    prerenderAttr: 'service',
    jsonLdBlocks: [schemaGraph],
  })
}

async function renderCityHtml(citySlug) {
  const data = await getCityPagePayload(citySlug)
  if (!data || !data.city) throw notFound('城市不存在')
  const seo = data.seo || {}
  const cityName = data.city.name
  const title = seo.title || `${cityName}汽车维修保养 · 辙见`
  const description =
    seo.description ||
    `查看${cityName}汽车维修保养门店、真实维修案例。公开案例已脱敏审核，价格仅供参考。`
  const canonical = absoluteUrl(seo.canonicalPath || `/city/${data.city.slug}`)
  const summary = `平台收录${cityName}本地可提供汽车维修保养服务的维修门店，并展示已审核的真实维修案例。`
  const bodyHtml = [
    `<h1>${escapeHtml(cityName)}透明汽车维修服务平台</h1>`,
    `<section data-bot="ai-summary"><h2>城市摘要</h2><p>${escapeHtml(summary)}</p></section>`,
    (data.serviceEntries || []).length
      ? `<section><h2>服务项目</h2>${listLinks(
          data.serviceEntries,
          (item) => item.h5Path || `/service/${item.slug || ''}.html`,
          (item) => item.name || item.title || '服务'
        )}</section>`
      : '',
    (data.recommendedMerchants || []).length
      ? `<section><h2>本地门店</h2>${listLinks(
          data.recommendedMerchants,
          (item) => `/store/${item.id}.html`,
          (item) => item.name || '门店'
        )}</section>`
      : '',
    (data.featuredCases || []).length
      ? `<section><h2>公开案例</h2>${listLinks(
          data.featuredCases,
          (item) =>
            item.slug ? `/case/${item.slug}.html` : `/case/view.html?id=${item.id}`,
          (item) => item.title || item.serviceName || '公开案例'
        )}</section>`
      : '',
    renderSiteBeianHtml(),
  ]
    .filter(Boolean)
    .join('\n')

  return injectPrerenderHtml(readH5Template('city/index.html'), {
    title,
    description,
    canonical,
    robots: seo.robots,
    bodyHtml,
    prerenderAttr: 'city',
    jsonLdBlocks: [
      buildWebPageGraph({
        canonicalPath: seo.canonicalPath || `/city/${data.city.slug}`,
        title,
        description,
      }),
    ],
  })
}

async function renderTopicHtml(slug) {
  const data = await getPublicTopicPagePayload(slug)
  if (!data || !data.topic) throw notFound('专题不存在')
  const topic = data.topic
  const seo = data.seo || {}
  const title = seo.title || `${topic.title} · 辙见`
  const description = seo.description || topic.aiSummary || topic.summary || ''
  const canonical = absoluteUrl(seo.canonicalPath || `/topic/${topic.slug}`)
  const faq = data.faq || []
  const bodyHtml = [
    `<h1>${escapeHtml(topic.title || topic.displayName || '专题')}</h1>`,
    topic.aiSummary || topic.summary
      ? `<section data-bot="ai-summary"><h2>专题摘要</h2><p>${escapeHtml(
          topic.aiSummary || topic.summary
        )}</p></section>`
      : '',
    renderFaqSection(faq, '常见问法'),
    (data.relatedCases || []).length
      ? `<section><h2>相关案例</h2>${listLinks(
          data.relatedCases,
          (item) =>
            item.slug ? `/case/${item.slug}.html` : `/case/view.html?id=${item.id}`,
          (item) => item.title || item.serviceName || '公开案例'
        )}</section>`
      : '',
    renderSiteBeianHtml(),
  ]
    .filter(Boolean)
    .join('\n')

  return injectPrerenderHtml(readH5Template('topic/index.html'), {
    title,
    description,
    canonical,
    robots: seo.robots,
    bodyHtml,
    prerenderAttr: 'topic',
    jsonLdBlocks: [
      buildWebPageGraph({
        canonicalPath: seo.canonicalPath || `/topic/${topic.slug}`,
        title,
        description,
        faq,
      }),
    ],
  })
}

async function renderCaseListHtml(query = {}) {
  const { listCases } = require('./content.service')
  const { H5_SERVICE_ITEMS } = require('../constants/h5-service-items')
  const SHORT_NAME = {
    'car-maintenance': '小保养',
    'brake-pad-replacement': '刹车片',
    'battery-replacement': '电瓶',
    'body-paint-repair': '钣喷',
    'accident-repair': '事故车',
  }
  const serviceSlug = String(query.service || '').trim()
  const catalog = H5_SERVICE_ITEMS.find((item) => item.slug === serviceSlug)
  const data = await listCases({ service: catalog ? catalog.slug : '', limit: 50 })
  const list = (data && data.list) || []
  const catName = catalog ? SHORT_NAME[catalog.slug] || catalog.name : '公开案例'
  const title = catalog ? `${catName} · 公开案例 · 辙见` : '公开案例 · 辙见'
  const description = '辙见公开案例 · 门店托管并公开的维修档案。'
  const canonicalPath = catalog ? `/case/?service=${catalog.slug}` : '/case/'
  const nav = [
    `<a href="/case/"${catalog ? '' : ' aria-current="page"'}>全部</a>`,
    ...H5_SERVICE_ITEMS.map((item) => {
      const label = SHORT_NAME[item.slug] || item.name
      return `<a href="/case/?service=${escapeHtml(item.slug)}"${
        catalog && catalog.slug === item.slug ? ' aria-current="page"' : ''
      }>${escapeHtml(label)}</a>`
    }),
  ].join(' ')
  const items = list.length
    ? `<ul>${list
        .map((item) => {
          const href = item.slug
            ? `/case/${item.slug}.html`
            : `/case/view.html?id=${item.id}`
          const label = [item.vehicleText, item.serviceName].filter(Boolean).join(' · ') ||
            item.title ||
            '公开案例'
          return `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`
        })
        .join('')}</ul>`
    : '<p>这一类暂时没有公开档案。</p>'

  const bodyHtml = [
    `<h1>公开案例</h1>`,
    `<p>门店托管并公开的维修档案。${catalog ? `当前分类：${escapeHtml(catName)}。` : ''}</p>`,
    `<nav>${nav}</nav>`,
    `<section><h2>${escapeHtml(catalog ? catName : '全部')}</h2>${items}</section>`,
    renderSiteBeianHtml(),
  ].join('\n')

  return injectPrerenderHtml(readH5Template('case/index.html'), {
    title,
    description,
    canonical: absoluteUrl(canonicalPath),
    robots: 'index,follow',
    bodyHtml,
    prerenderAttr: 'case-list',
    jsonLdBlocks: [
      buildWebPageGraph({
        canonicalPath,
        title,
        description,
      }),
    ],
  })
}

module.exports = {
  renderHomeHtml,
  renderServiceHtml,
  renderCityHtml,
  renderTopicHtml,
  renderCaseListHtml,
}
