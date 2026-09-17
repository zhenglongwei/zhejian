/**
 * GEO-CITE-E01/E02 · H5 案例 Bot 预渲染 HTML
 */
const {
  injectPrerenderHtml,
  escapeHtml,
  absoluteUrl,
  readH5Template,
  renderFaqSection,
} = require('../lib/h5-html-prerender')
const { config } = require('../config')
const { getCaseDetail } = require('./content.service')
const { buildCasePageSchemaGraph } = require('../lib/schema-graph')
const { resolveCaseCanonicalPath } = require('../utils/case-slug')
const { renderSiteBeianHtml } = require('../lib/site-beian')

const BOT_UA_RE =
  /(gptbot|chatgpt-user|claudebot|claude-web|googlebot|bingbot|bytespider|perplexitybot|amazonbot)/i

function isCrawlerUserAgent(userAgent) {
  return BOT_UA_RE.test(String(userAgent || ''))
}

function isCrawlerRequest(req) {
  if (isCrawlerUserAgent(req.headers['user-agent'])) return true
  if (String(req.headers['x-crawler-bot'] || '').trim()) return true
  return false
}

function buildHowToSchema(data, nodes) {
  const steps = (nodes || [])
    .filter((node) => node && (node.title || node.note))
    .slice(0, 6)
    .map((node, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: node.title || `步骤${index + 1}`,
      text: node.note || node.title || '',
    }))
  if (!steps.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: data.title || data.serviceName || '维修过程',
    description: data.aiSummary || data.summary || '',
    step: steps,
  }
}

function buildImageObjectSchemas(data, nodes, canonical) {
  const schemas = []
  ;(nodes || []).forEach((node) => {
    const images = (node.imagesDesensitized || node.images || []).filter(Boolean)
    images.slice(0, 3).forEach((url, index) => {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'ImageObject',
        contentUrl: absoluteUrl(url),
        name: `${node.title || '维修过程'} 图${index + 1}`,
        description:
          (data.article?.nodeNarratives || []).find((n) => n.nodeId === (node.id || node.nodeId))
            ?.imageCaptions?.[index]?.alt ||
          `${data.city || ''}${data.serviceName || ''}${node.title || ''}`.trim(),
        isPartOf: { '@type': 'WebPage', '@id': canonical },
      })
    })
  })
  return schemas
}

function buildBotBodyHtml(data) {
  const summary = data.displayAiSummary || data.aiSummary || data.summary || ''
  const nodes = data.displayNodes || data.nodes || []
  const articleBody =
    Number(data.snapshotVersion) >= 1
      ? String(data.articleBody || data.article?.body || '').trim()
      : String(data.article?.body || data.articleBody || '').trim()
  const sections = [
    `<h1>${escapeHtml(data.title || '维修案例')}</h1>`,
    summary
      ? `<section data-bot="ai-summary"><h2>案例摘要</h2><p>${escapeHtml(summary)}</p></section>`
      : '',
    articleBody
      ? `<section data-bot="article-body"><h2>案例正文</h2><p>${escapeHtml(articleBody).replace(/\n/g, '<br>')}</p></section>`
      : '',
    nodes.length
      ? `<section data-bot="process"><h2>维修过程</h2>${nodes
          .map(
            (node) =>
              `<article><h3>${escapeHtml(node.title || '')}</h3>${
                node.note ? `<p>${escapeHtml(node.note)}</p>` : ''
              }</article>`
          )
          .join('')}</section>`
      : '',
    renderFaqSection(data.faq || []),
    renderSiteBeianHtml(),
  ]
  return sections.filter(Boolean).join('\n')
}

async function renderCaseBotHtml(caseIdOrSlug) {
  const data = await getCaseDetail(caseIdOrSlug)
  if (!data) {
    const err = new Error('案例不存在或未公开')
    err.status = 404
    throw err
  }

  const canonicalPath =
    data.seo?.canonicalPath ||
    resolveCaseCanonicalPath({ slug: data.slug || data.seo?.slug, caseId: data.id })
  const canonical = absoluteUrl(canonicalPath)
  const title = data.seo?.title || data.title || '维修案例'
  const description =
    data.displayAiSummary || data.aiSummary || data.summary || data.seo?.description || ''

  const jsonLdBlocks = []
  if (data.schemaGraph) {
    jsonLdBlocks.push(data.schemaGraph)
  } else {
    jsonLdBlocks.push(
      buildCasePageSchemaGraph({
        baseUrl: config.publicBaseUrl,
        showStorePublicly: Boolean(data.showStorePublicly && data.store && data.store.name),
        serviceSlug: '',
        data: {
          ...data,
          faq: data.faq || [],
          trustMeta: data.trustMeta || null,
        },
        organizationSameAs: config.geo?.organizationSameAs || [],
      })
    )
  }
  const howTo = buildHowToSchema(data, data.displayNodes || data.nodes)
  if (howTo) jsonLdBlocks.push(howTo)
  if (!data.schemaGraph) {
    const imageObjects = buildImageObjectSchemas(data, data.displayNodes || data.nodes, canonical)
    jsonLdBlocks.push(...imageObjects)
  }

  return injectPrerenderHtml(readH5Template('case/view.html'), {
    title: `${title} · 辙见`,
    description,
    canonical,
    robots: data.seo?.robots || (data.seo?.noindex ? 'noindex,follow' : 'index,follow'),
    bodyHtml: buildBotBodyHtml(data),
    jsonLdBlocks,
    prerenderAttr: 'geo-cite-e',
  })
}

module.exports = {
  isCrawlerUserAgent,
  isCrawlerRequest,
  renderCaseBotHtml,
}
