const { config } = require('../config')
const { listServiceCities } = require('../constants/cities')
const { H5_SERVICE_ITEMS } = require('../constants/h5-service-items')
const { renderUrlSet, renderSitemapIndex, formatSitemapDate } = require('../lib/sitemap-xml')
const { resolveCaseCanonicalPath } = require('../utils/case-slug')
const { fetchPublicCaseRows, listCases, listMerchants } = require('./content.service')
const { listGeoPages, getGeoPageDetail } = require('./geo.service')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')

const SITEMAP_TYPES = new Set(['pages', 'cases', 'stores'])

function absUrl(path) {
  const base = config.publicBaseUrl.replace(/\/$/, '')
  const normalized = String(path || '').startsWith('/') ? path : `/${path || ''}`
  return `${base}${normalized}`
}

function cityAllowIndex({ storeCount, caseCount }) {
  return storeCount > 0 && (caseCount > 0 || storeCount >= 1)
}

async function collectCaseEntries() {
  const rows = await fetchPublicCaseRows()
  return rows
    .filter((item) => !item.seoNoindex && !(item.seo && item.seo.noindex))
    .map((item) => {
      const path =
        item.canonicalPath ||
        (item.seo && item.seo.canonicalPath) ||
        resolveCaseCanonicalPath({
          slug: item.slug || (item.seo && item.seo.slug),
          caseId: item.id,
        })
      if (!path) return null
      return {
        loc: absUrl(path),
        lastmod: item.publishedAt || item.updatedAt,
        changefreq: 'weekly',
        priority: '0.8',
      }
    })
    .filter(Boolean)
}

async function collectStoreEntries() {
  const { list } = await listMerchants({ limit: 0 })
  const today = formatSitemapDate(new Date())
  const entries = []

  list.forEach((store) => {
    if (!store.id || store.status === 'offline') return
    entries.push({
      loc: absUrl(`/store/${store.id}.html`),
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.7',
    })
    if ((store.caseCount || 0) > 0) {
      entries.push({
        loc: absUrl(`/store/${store.id}/cases`),
        lastmod: today,
        changefreq: 'weekly',
        priority: '0.6',
      })
    }
  })

  return entries
}

async function collectPageEntries() {
  const today = formatSitemapDate(new Date())
  const entries = [
    {
      loc: absUrl('/'),
      lastmod: today,
      changefreq: 'daily',
      priority: '1.0',
    },
    {
      loc: absUrl('/case/'),
      lastmod: today,
      changefreq: 'daily',
      priority: '0.8',
    },
    {
      loc: absUrl('/store/'),
      lastmod: today,
      changefreq: 'daily',
      priority: '0.8',
    },
  ]

  const [allCases, { list: allStores }] = await Promise.all([
    fetchPublicCaseRows(),
    listMerchants({ limit: 0 }),
  ])

  listServiceCities().forEach((city) => {
    const cityCases = allCases.filter((item) => item.city === city.name)
    const cityStores = allStores.filter(
      (store) =>
        (store.address && store.address.includes(city.name)) ||
        cityCases.some((item) => item.storeId === store.id)
    )
    if (
      !cityAllowIndex({
        storeCount: cityStores.length,
        caseCount: cityCases.length,
      })
    ) {
      return
    }
    entries.push({
      loc: absUrl(`/city/${city.slug}`),
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.9',
    })
  })

  for (const item of H5_SERVICE_ITEMS) {
    const { total: caseTotal } = await listCases({ serviceItemId: item.serviceItemId, limit: 1 })
    const storeTotal = allStores.filter((s) => (s.caseCount || 0) > 0).length
    const allowIndex = caseTotal > 0 || storeTotal > 0
    if (!allowIndex) continue

    entries.push({
      loc: absUrl(`/service/${item.slug}.html`),
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.8',
    })
    if (caseTotal > 0) {
      entries.push({
        loc: absUrl(`/service/${item.slug}/cases`),
        lastmod: today,
        changefreq: 'weekly',
        priority: '0.7',
      })
    }
  }

  const { list: geoList } = await listGeoPages({
    limit: 0,
    status: GEO_PAGE_STATUS.PUBLISHED,
  })
  for (const topic of geoList) {
    if (topic.pageType === 'service_base') continue
    try {
      const detail = await getGeoPageDetail(topic.slug || topic.id)
      const allowIndex = detail.relatedCaseCount > 0 || detail.relatedStoreCount > 0
      if (!allowIndex) continue
      const servicePath = detail.h5Path || `/topic/${detail.slug}`
      if (servicePath.indexOf('/service/') !== 0) continue
      entries.push({
        loc: absUrl(servicePath),
        lastmod: detail.updatedAt || today,
        changefreq: 'weekly',
        priority: '0.7',
      })
    } catch (e) {
      // skip offline topics
    }
  }

  return entries
}

async function getSitemapEntriesByType(type) {
  if (type === 'cases') return collectCaseEntries()
  if (type === 'stores') return collectStoreEntries()
  if (type === 'pages') return collectPageEntries()
  return []
}

async function getSitemapXmlByType(type) {
  const normalized = String(type || '').trim().toLowerCase()
  if (!SITEMAP_TYPES.has(normalized)) {
    const err = new Error('sitemap 类型不存在')
    err.status = 404
    throw err
  }
  const entries = await getSitemapEntriesByType(normalized)
  return renderUrlSet(entries)
}

async function getSitemapIndexXml() {
  const today = formatSitemapDate(new Date())
  const base = config.publicBaseUrl.replace(/\/$/, '')
  return renderSitemapIndex([
    { loc: `${base}/sitemap-pages.xml`, lastmod: today },
    { loc: `${base}/sitemap-cases.xml`, lastmod: today },
    { loc: `${base}/sitemap-stores.xml`, lastmod: today },
  ])
}

function getRobotsTxt() {
  const base = config.publicBaseUrl.replace(/\/$/, '')
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /album/',
    'Disallow: /admin/',
    'Disallow: /api/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n')
}

async function getSitemapStats() {
  const [pages, cases, stores] = await Promise.all([
    collectPageEntries(),
    collectCaseEntries(),
    collectStoreEntries(),
  ])
  return {
    pages: pages.length,
    cases: cases.length,
    stores: stores.length,
    total: pages.length + cases.length + stores.length,
  }
}

module.exports = {
  SITEMAP_TYPES,
  getSitemapIndexXml,
  getSitemapXmlByType,
  getRobotsTxt,
  getSitemapStats,
  collectPageEntries,
  collectCaseEntries,
  collectStoreEntries,
}
