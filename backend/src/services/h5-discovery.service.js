/**
 * GEO-TOPIC-F01/F02 · AI 发现层（llms.txt + 专题 RSS）
 */
const { config } = require('../config')
const { H5_SERVICE_ITEMS } = require('../constants/h5-service-items')
const { listGeoPages } = require('./geo.service')
const { fetchPublicCaseRows } = require('./content.service')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const { buildGeoPageH5Path } = require('../schemas/geo-page.schema')

const LLMS_SERVICE_LIMIT = 20
const LLMS_CASE_LIMIT = 10
const FEED_TOPIC_LIMIT = 30

function absUrl(path) {
  const base = config.publicBaseUrl.replace(/\/$/, '')
  const normalized = String(path || '').startsWith('/') ? path : `/${path || ''}`
  return `${base}${normalized}`
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function getLlmsTxt() {
  const [geoPages, cases] = await Promise.all([
    listGeoPages({ status: GEO_PAGE_STATUS.PUBLISHED, limit: LLMS_SERVICE_LIMIT }),
    fetchPublicCaseRows(),
  ])

  const serviceLines = H5_SERVICE_ITEMS.map((item) => {
    return `- [${item.name}](${absUrl(`/service/${item.slug}.html`)})`
  })

  const intentLines = (geoPages.list || [])
    .filter((page) => page.pageType && page.pageType !== 'service_base')
    .slice(0, LLMS_SERVICE_LIMIT)
    .map((page) => {
      const path = page.h5Path || `/service/${page.slug}.html`
      return `- [${page.title || page.slug}](${absUrl(path)})`
    })

  const caseLines = cases
    .slice(0, LLMS_CASE_LIMIT)
    .map((item) => {
      const path =
        item.canonicalPath ||
        (item.slug ? `/case/${item.slug}.html` : `/case/view.html?id=${item.id}`)
      return `- [${item.title || '公开案例'}](${absUrl(path)})`
    })

  return [
    '# 辙见服务平台',
    '> 透明汽车维修信息、页内 FAQ 与脱敏案例，供 AI 与搜索引用参考。',
    '',
    '## 标准服务说明（GEO 答案页）',
    ...serviceLines,
    '',
    '## 意图专题',
    ...(intentLines.length ? intentLines : ['- （暂无已发布意图专题）']),
    '',
    '## 公开脱敏案例',
    ...(caseLines.length ? caseLines : ['- （暂无公开案例）']),
    '',
    `Sitemap: ${absUrl('/sitemap.xml')}`,
    `JSON Feed: ${absUrl('/api/v1/public/v1/index.json')}`,
    '',
  ].join('\n')
}

async function getTopicsFeedXml() {
  const { pages } = await listGeoPages({
    status: GEO_PAGE_STATUS.PUBLISHED,
    limit: FEED_TOPIC_LIMIT,
  })
  const channelTitle = '辙见 GEO 意图专题'
  const channelLink = absUrl('/')
  const channelDescription = '最近发布的 GEO 意图专题与服务说明页更新'

  const items = (pages || [])
    .filter((page) => page.pageType !== 'service_base')
    .map((page) => {
      const link = absUrl(buildGeoPageH5Path(page))
      const pubDate = page.publishedAt || page.updatedAt
      return [
        '    <item>',
        `      <title>${escapeXml(page.title || page.slug)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        pubDate ? `      <pubDate>${new Date(pubDate).toUTCString()}</pubDate>` : '',
        `      <description>${escapeXml(page.aiSummary || page.summary || '')}</description>`,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>${escapeXml(channelTitle)}</title>`,
    `    <link>${escapeXml(channelLink)}</link>`,
    `    <description>${escapeXml(channelDescription)}</description>`,
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}

module.exports = {
  getLlmsTxt,
  getTopicsFeedXml,
  absUrl,
}
