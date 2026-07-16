/**
 * 服务项目页 GEO 增强：合并 geo_pages 运营内容与目录常量
 */
const { prisma } = require('../lib/prisma')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const { mapGeoPageRow } = require('../schemas/geo-page.schema')
const { listGeoPages } = require('./geo-page-store.service')
const { filterTopicsForServiceItem } = require('../utils/geo-intent-discovery')

const PUBLISHED_STATUSES = [GEO_PAGE_STATUS.PUBLISHED, GEO_PAGE_STATUS.NOINDEX]

async function loadGeoOverlayForServiceItem(item) {
  if (!item) return null

  const row = await prisma.geoPage.findFirst({
    where: {
      status: { in: PUBLISHED_STATUSES },
      OR: [
        { slug: item.slug },
        { serviceId: item.serviceItemId },
        { relatedServiceId: item.serviceItemId },
      ],
    },
    orderBy: [{ updatedAt: 'desc' }],
  })

  if (!row) return null
  return mapGeoPageRow(row)
}

async function listPublishedTopicsForServiceItem(item, options = {}) {
  if (!item) return []
  const { list } = await listGeoPages({ limit: 0 })
  return filterTopicsForServiceItem(list, item, options)
}

function mergeServiceItemWithGeo(item, geoPage, cityFilter) {
  if (!geoPage) {
    return {
      aiSummary: item.summary || '',
      summary: item.summary || '',
      scenarios: item.scenarios || [],
      process: item.process || [],
      priceFactors: item.priceFactors || [],
      articleBody: '',
      seoTitle: '',
      seoDescription: '',
      cityFilter: cityFilter || '',
    }
  }

  return {
    aiSummary: geoPage.aiSummary || geoPage.summary || item.summary || '',
    summary: geoPage.summary || item.summary || '',
    scenarios: geoPage.scenarios?.length ? geoPage.scenarios : item.scenarios || [],
    process: geoPage.serviceMeta?.process?.length
      ? geoPage.serviceMeta.process
      : item.process || [],
    priceFactors: geoPage.priceFactors?.length ? geoPage.priceFactors : item.priceFactors || [],
    articleBody: geoPage.articleBody || geoPage.serviceMeta?.articleBody || '',
    seoTitle: geoPage.seoTitle || '',
    seoDescription: geoPage.seoDescription || '',
    cityFilter: cityFilter || geoPage.city || '',
  }
}

module.exports = {
  loadGeoOverlayForServiceItem,
  listPublishedTopicsForServiceItem,
  mergeServiceItemWithGeo,
}
