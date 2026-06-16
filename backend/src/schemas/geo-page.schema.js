/**
 * GEO-TOPIC · GeoPage 数据契约（读/写共用）
 */
const { toIso } = require('../lib/ids')

function parseJsonArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

function normalizeFaqItem(item) {
  if (!item || typeof item !== 'object') return null
  const q = String(item.q || item.question || '').trim()
  const a = String(item.a || item.answer || '').trim()
  if (!q || !a) return null
  return { q, a }
}

function normalizeFaq(value) {
  if (!Array.isArray(value)) return []
  return value.map(normalizeFaqItem).filter(Boolean)
}

function normalizeFaqLinks(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const title = String(item.title || '').trim()
      const url = String(item.url || '').trim()
      if (!title || !url) return null
      return { title, url }
    })
    .filter(Boolean)
}

/**
 * @param {import('@prisma/client').GeoPage} row
 */
function mapGeoPageRow(row) {
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug,
    title: row.title || '',
    summary: row.summary || '',
    coverImage: row.coverImage || '',
    pageType: row.pageType || 'city_service',
    city: row.city || '',
    serviceId: row.serviceId || '',
    faultTag: row.faultTag || '',
    vehicleSeries: row.vehicleSeries || '',
    keywords: parseJsonArray(row.keywordsJson),
    scenarios: parseJsonArray(row.scenariosJson),
    priceFactors: parseJsonArray(row.priceFactorsJson),
    faq: normalizeFaq(row.faqJson),
    faqLinks: normalizeFaqLinks(row.faqLinksJson),
    relatedCaseIds: parseJsonArray(row.relatedCaseIdsJson),
    relatedStoreIds: parseJsonArray(row.relatedStoreIdsJson),
    primaryStoreId: row.primaryStoreId || '',
    relatedServiceId: row.relatedServiceId || '',
    seoTitle: row.seoTitle || '',
    seoDescription: row.seoDescription || '',
    aiSummary: row.aiSummary || '',
    status: row.status || 'draft',
    publishedAt: row.publishedAt ? toIso(row.publishedAt) : '',
    updatedAt: row.updatedAt ? toIso(row.updatedAt) : '',
    createdAt: row.createdAt ? toIso(row.createdAt) : '',
  }
}

function mapGeoListItem(page) {
  const slug = page.slug || page.id
  return {
    id: page.id,
    slug,
    title: page.title,
    summary: page.summary,
    coverImage: page.coverImage || '',
    city: page.city,
    pageType: page.pageType,
    keywords: page.keywords || [],
    status: page.status,
    updatedAt: page.updatedAt,
    h5Path: `/topic/${slug}`,
  }
}

function buildGeoPageWriteData(payload = {}, existing = null) {
  const base = existing || {}
  const data = {}

  if (payload.slug != null) data.slug = String(payload.slug).trim()
  if (payload.title != null) data.title = String(payload.title).trim()
  if (payload.summary != null) data.summary = String(payload.summary).trim()
  if (payload.coverImage != null) data.coverImage = String(payload.coverImage).trim()
  if (payload.pageType != null) data.pageType = String(payload.pageType).trim()
  if (payload.city != null) data.city = String(payload.city).trim()
  if (payload.serviceId != null) data.serviceId = String(payload.serviceId).trim()
  if (payload.faultTag != null) data.faultTag = String(payload.faultTag).trim()
  if (payload.vehicleSeries != null) data.vehicleSeries = String(payload.vehicleSeries).trim()
  if (payload.primaryStoreId != null) data.primaryStoreId = String(payload.primaryStoreId).trim()
  if (payload.relatedServiceId != null) data.relatedServiceId = String(payload.relatedServiceId).trim()
  if (payload.seoTitle != null) data.seoTitle = String(payload.seoTitle).trim()
  if (payload.seoDescription != null) data.seoDescription = String(payload.seoDescription).trim()
  if (payload.aiSummary != null) data.aiSummary = String(payload.aiSummary).trim()
  if (payload.status != null) data.status = String(payload.status).trim()

  if (payload.keywords != null) data.keywordsJson = parseJsonArray(payload.keywords)
  if (payload.scenarios != null) data.scenariosJson = parseJsonArray(payload.scenarios)
  if (payload.priceFactors != null) data.priceFactorsJson = parseJsonArray(payload.priceFactors)
  if (payload.faq != null) data.faqJson = normalizeFaq(payload.faq)
  if (payload.faqLinks != null) data.faqLinksJson = normalizeFaqLinks(payload.faqLinks)
  if (payload.relatedCaseIds != null) data.relatedCaseIdsJson = parseJsonArray(payload.relatedCaseIds)
  if (payload.relatedStoreIds != null) {
    data.relatedStoreIdsJson = parseJsonArray(payload.relatedStoreIds)
  }

  if (!data.slug && !base.slug) {
    data.slug = ''
  }

  return data
}

module.exports = {
  mapGeoPageRow,
  mapGeoListItem,
  buildGeoPageWriteData,
  normalizeFaq,
  normalizeFaqLinks,
  parseJsonArray,
}
