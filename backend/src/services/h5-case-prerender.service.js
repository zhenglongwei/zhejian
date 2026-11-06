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
  const captions = data.photoCaptions && typeof data.photoCaptions === 'object' ? data.photoCaptions : {}
  const captionFor = (url) => {
    const key = String(url || '').trim().split('?')[0].split('#')[0]
    return String(captions[key] || '').trim()
  }
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
          captionFor(url) ||
          (data.article?.nodeNarratives || []).find((n) => n.nodeId === (node.id || node.nodeId))
            ?.imageCaptions?.[index]?.alt ||
          `${data.city || ''}${data.serviceName || ''}${node.title || ''}`.trim(),
        isPartOf: { '@type': 'WebPage', '@id': canonical },
      })
    })
  })
  return schemas
}

function visibleSummary(data) {
  const hostCopy = data.hostPublicCopy || (data.contentJson && data.contentJson.hostPublicCopy)
  const geo = data.hostGeoLayer || (data.contentJson && data.contentJson.hostGeoLayer)
  return String(
    (hostCopy && hostCopy.overview) ||
      (geo && geo.summary) ||
      data.displayAiSummary ||
      data.aiSummary ||
      data.summary ||
      '',
  ).trim()
}

function isBlankWarranty(value) {
  const bare = String(value || '')
    .trim()
    .replace(/[。．.]$/, '')
  return !bare || bare === '无' || bare === '暂无' || bare === '没有' || bare === '无备注'
}

function chapterLines(chapter) {
  const lines = []
  if (chapter.chiefComplaint) lines.push(`进店主诉：${chapter.chiefComplaint}`)
  ;(chapter.findings || []).forEach((row) => {
    const bits = [row && row.partName, row && row.advice].filter(Boolean)
    if (bits.length) lines.push(bits.join('：'))
  })
  ;(chapter.items || []).forEach((item) => {
    const extra = [item && item.brand, item && item.note].filter(Boolean).join('，')
    const line = [item && item.name, extra].filter(Boolean).join('：')
    if (line) lines.push(line)
  })
  ;(chapter.photos || []).forEach((photo) => {
    if (photo && photo.caption) lines.push(photo.caption)
  })
  const warranty = [chapter.warrantyPeriod, chapter.warrantyNotes].filter((bit) => !isBlankWarranty(bit))
  if (warranty.length) lines.push(`质保：${warranty.join(' · ')}`)
  return lines
}

function renderFlowSection(data) {
  const chapters = (data.serviceFlow && data.serviceFlow.chapters) || []
  const blocks = chapters
    .map((chapter) => {
      const lines = chapterLines(chapter)
      if (!lines.length) return ''
      return `<article><h3>${escapeHtml(chapter.title || '')}</h3>${lines
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join('')}</article>`
    })
    .filter(Boolean)
  if (!blocks.length) return ''
  return `<section data-bot="process"><h2>维修过程</h2>${blocks.join('')}</section>`
}

function hostNodeStories(data) {
  const layer = data.hostGeoLayer || (data.contentJson && data.contentJson.hostGeoLayer) || null
  return (layer && Array.isArray(layer.nodeStories) ? layer.nodeStories : [])
    .map((row) => String((row && typeof row === 'object' ? row.text : row) || '').trim())
    .filter(Boolean)
    .slice(0, 5)
}

function renderNodeStoriesSection(data) {
  const stories = hostNodeStories(data)
  if (!stories.length) return ''
  return `<section data-bot="process-stories"><h2>维修实录</h2>${stories
    .map((text) => `<p>${escapeHtml(text)}</p>`)
    .join('')}</section>`
}

/** 爬虫正文与人看到的页面一致：摘要、维修实录、关键节点说明、问答。不含套话文章。 */
function buildCrawlText(data) {
  const parts = []
  const summary = visibleSummary(data)
  if (summary) parts.push(summary)
  hostNodeStories(data).forEach((text) => parts.push(text))
  ;((data.serviceFlow && data.serviceFlow.chapters) || []).forEach((chapter) => {
    const lines = chapterLines(chapter)
    if (!lines.length) return
    parts.push([chapter.title, ...lines].filter(Boolean).join('\n'))
  })
  ;(data.faq || []).forEach((row) => {
    const q = row && (row.q || row.question)
    const a = row && (row.a || row.answer)
    if (q && a) parts.push(`${q}\n${a}`)
  })
  return parts.join('\n\n')
}

function buildBotBodyHtml(data) {
  const summary = visibleSummary(data)
  const sections = [
    `<h1>${escapeHtml(data.title || '维修案例')}</h1>`,
    summary
      ? `<section data-bot="ai-summary"><h2>案例摘要</h2><p>${escapeHtml(summary)}</p></section>`
      : '',
    renderNodeStoriesSection(data),
    renderFlowSection(data),
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

  const crawlText = buildCrawlText(data)
  const crawlData = {
    ...data,
    faq: data.faq || [],
    trustMeta: data.trustMeta || null,
    articleBody: crawlText,
    article: { ...(data.article || {}), body: crawlText },
  }
  const jsonLdBlocks = []
  if (data.schemaGraph) {
    const graph = data.schemaGraph
    const nodes = Array.isArray(graph['@graph']) ? graph['@graph'] : []
    nodes.forEach((node) => {
      if (node && node['@type'] === 'Article') node.articleBody = crawlText
    })
    jsonLdBlocks.push(graph)
  } else {
    jsonLdBlocks.push(
      buildCasePageSchemaGraph({
        baseUrl: config.publicBaseUrl,
        showStorePublicly: Boolean(data.showStorePublicly && data.store && data.store.name),
        serviceSlug: '',
        data: crawlData,
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
  buildBotBodyHtml,
  buildCrawlText,
  renderCaseBotHtml,
}
