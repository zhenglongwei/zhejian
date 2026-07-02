/**
 * GEO-IGAIN-C01 · Schema.org @graph 实体互链（服务端真源）
 */
const { STATS_WINDOW_LABEL } = require('../services/geo-case-aggregate.service')

const SCHEMA_CONTEXT = 'https://schema.org'
const ORG_NAME = '辙见'

function normalizeBase(baseUrl) {
  return String(baseUrl || '').replace(/\/$/, '') || 'https://geo.simplewin.cn'
}

function entityId(base, path, fragment) {
  const baseNorm = normalizeBase(base)
  const pathNorm = String(path || '/').startsWith('/') ? path : `/${path || ''}`
  const frag = String(fragment || '').replace(/^#/, '')
  return `${baseNorm}${pathNorm}${frag ? `#${frag}` : ''}`
}

function buildOrganizationNode(baseUrl, sameAs = []) {
  const base = normalizeBase(baseUrl)
  const node = {
    '@type': 'Organization',
    '@id': `${base}/#organization`,
    name: ORG_NAME,
    url: `${base}/`,
  }
  const links = (sameAs || []).map((item) => String(item || '').trim()).filter(Boolean)
  if (links.length) node.sameAs = links
  return node
}

function buildDatasetNode({ baseUrl, canonicalPath, serviceName, aggregateStats }) {
  const stats = aggregateStats || {}
  if (!stats.sampleSize || stats.sampleSize < 1) return null

  const canonical = entityId(baseUrl, canonicalPath, '')
  const parts = [`${STATS_WINDOW_LABEL}收录 ${stats.sampleSize} 例脱敏案例`]
  if (stats.price?.text) parts.push(stats.price.text)
  ;(stats.causeDistribution || []).forEach((item) => {
    parts.push(`${item.label}（${item.count} 例）`)
  })

  return {
    '@type': 'Dataset',
    '@id': entityId(baseUrl, canonicalPath, 'dataset'),
    name: `${serviceName || '维修服务'}脱敏案例聚合统计`,
    description: parts.join('；'),
    temporalCoverage: 'P12M',
    variableMeasured: parts.map((text) => ({
      '@type': 'PropertyValue',
      name: 'aggregateMetric',
      value: text,
    })),
    isPartOf: { '@id': entityId(baseUrl, canonicalPath, 'service') },
    url: canonical,
  }
}

function buildFaqNode(faq) {
  const visible = (faq || []).filter((entry) => entry && (entry.q || entry.question) && (entry.a || entry.answer))
  if (!visible.length) return null
  return {
    '@type': 'FAQPage',
    mainEntity: visible.map((entry) => ({
      '@type': 'Question',
      name: entry.q || entry.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: entry.a || entry.answer,
      },
    })),
  }
}

/**
 * @param {object} input
 */
function buildServicePageSchemaGraph(input) {
  const baseUrl = normalizeBase(input.baseUrl)
  const item = input.item || {}
  const seo = input.seo || {}
  const geo = input.geo || {}
  const canonicalPath = seo.canonicalPath || `/service/${item.slug || ''}.html`
  const canonical = entityId(baseUrl, canonicalPath, '')
  const title = seo.title || `${item.name || '服务项目'} · 辙见`
  const description = seo.description || item.aiSummary || item.summary || ''

  const organization = buildOrganizationNode(baseUrl, input.organizationSameAs)
  const graph = [
    organization,
    {
      '@type': 'WebPage',
      '@id': entityId(baseUrl, canonicalPath, 'webpage'),
      name: title,
      description,
      url: canonical,
      dateModified: geo.updatedAt || undefined,
      datePublished: geo.publishedAt || undefined,
      isPartOf: { '@id': organization['@id'] },
    },
    {
      '@type': 'Service',
      '@id': entityId(baseUrl, canonicalPath, 'service'),
      name: item.name || '维修服务',
      description: item.aiSummary || item.summary || description,
      url: canonical,
      provider: { '@id': organization['@id'] },
      areaServed: item.cityFilter
        ? { '@type': 'City', name: item.cityFilter }
        : { '@type': 'Country', name: '中国' },
    },
  ]

  const dataset = buildDatasetNode({
    baseUrl,
    canonicalPath,
    serviceName: item.name,
    aggregateStats: input.aggregateStats,
  })
  if (dataset) graph.push(dataset)

  const faqNode = buildFaqNode(input.faq)
  if (faqNode) graph.push(faqNode)

  return {
    '@context': SCHEMA_CONTEXT,
    '@graph': graph,
  }
}

/**
 * @param {object} input
 */
function buildCasePageSchemaGraph(input) {
  const baseUrl = normalizeBase(input.baseUrl)
  const data = input.data || {}
  const canonicalPath =
    data.canonicalPath ||
    (data.seo && data.seo.canonicalPath) ||
    (data.slug ? `/case/${data.slug}.html` : `/case/view.html?id=${data.id || ''}`)
  const canonical = canonicalPath.startsWith('http')
    ? canonicalPath
    : entityId(baseUrl, canonicalPath, '')
  const title = (data.seo && data.seo.title) || data.title || '维修案例'
  const description = data.aiSummary || data.summary || (data.seo && data.seo.description) || ''
  const cover = data.coverImageDesensitized || data.coverImage || ''
  const showStore = Boolean(input.showStorePublicly && data.store && data.store.name)

  const organization = buildOrganizationNode(baseUrl, input.organizationSameAs)
  const graph = [organization]

  const articleId = entityId(
    baseUrl,
    canonicalPath.replace(/^https?:\/\/[^/]+/, ''),
    'article'
  )

  graph.push({
    '@type': 'Article',
    '@id': articleId,
    headline: data.title || title,
    description,
    articleBody: (data.article && data.article.body) || data.articleBody || undefined,
    url: canonical,
    datePublished: data.publishedAt || undefined,
    dateModified: data.updatedAt || data.publishedAt || undefined,
    image: cover || undefined,
    author: showStore
      ? {
          '@type': 'AutoRepair',
          '@id': entityId(baseUrl, `/store/${data.store.id}.html`, 'autorepair'),
          name: data.store.name,
        }
      : { '@id': organization['@id'] },
    publisher: { '@id': organization['@id'] },
    mainEntityOfPage: { '@id': entityId(baseUrl, canonicalPath.replace(/^https?:\/\/[^/]+/, ''), 'webpage') },
  })

  graph.push({
    '@type': 'WebPage',
    '@id': entityId(baseUrl, canonicalPath.replace(/^https?:\/\/[^/]+/, ''), 'webpage'),
    name: title,
    description,
    url: canonical,
  })

  if (data.serviceName) {
    const serviceSlug = input.serviceSlug || ''
    const servicePath = serviceSlug ? `/service/${serviceSlug}.html` : canonicalPath
    graph.push({
      '@type': 'Service',
      '@id': entityId(baseUrl, servicePath, 'service'),
      name: data.serviceName,
      description,
      provider: showStore
        ? { '@id': entityId(baseUrl, `/store/${data.store.id}.html`, 'autorepair') }
        : { '@id': organization['@id'] },
      areaServed: data.city ? { '@type': 'City', name: data.city } : undefined,
    })
    graph[graph.length - 1].about = { '@id': graph[graph.length - 1]['@id'] }
    graph[1].about = { '@id': graph[graph.length - 1]['@id'] }
  }

  if (cover) {
    graph.push({
      '@type': 'ImageObject',
      contentUrl: cover.startsWith('http') ? cover : entityId(baseUrl, cover, ''),
      name: data.title || title,
      description,
      isPartOf: { '@id': articleId },
    })
  }

  const faqNode = buildFaqNode(data.faq)
  if (faqNode) graph.push(faqNode)

  return {
    '@context': SCHEMA_CONTEXT,
    '@graph': graph,
  }
}

/**
 * @param {{ baseUrl?: string, organizationSameAs?: string[] }} [input]
 */
function buildHomePageSchemaGraph(input = {}) {
  const baseUrl = normalizeBase(input.baseUrl)
  const organization = buildOrganizationNode(baseUrl, input.organizationSameAs)
  const canonical = `${normalizeBase(baseUrl)}/`
  return {
    '@context': SCHEMA_CONTEXT,
    '@graph': [
      organization,
      {
        '@type': 'WebSite',
        '@id': entityId(baseUrl, '/', 'website'),
        name: ORG_NAME,
        url: canonical,
        publisher: { '@id': organization['@id'] },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${canonical}search/?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  }
}

module.exports = {
  SCHEMA_CONTEXT,
  normalizeBase,
  entityId,
  buildOrganizationNode,
  buildDatasetNode,
  buildServicePageSchemaGraph,
  buildCasePageSchemaGraph,
  buildHomePageSchemaGraph,
}
