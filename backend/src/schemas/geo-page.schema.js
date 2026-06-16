/**
 * GEO-TOPIC · GeoPage 数据契约（读/写共用）
 */
const { toIso } = require('../lib/ids')
const {
  resolveH5ServiceItemBySlug,
  resolveH5ServiceItemById,
  H5_SERVICE_ITEMS,
} = require('../constants/h5-service-items')

const MAX_FAQ_ITEMS = 20
const MAX_FAQ_Q_LEN = 120
const MAX_FAQ_A_LEN = 500
const GEO_FAQ_BANNED_PHRASES = [
  '好评返现',
  '晒图返现',
  '分享赚钱',
  '转发领钱',
  '全网最低',
  '100%修好',
  '保证一次修好',
  '永久不复发',
  '全城最便宜',
  '必须马上维修',
]

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

function normalizeFaq(value, options = {}) {
  if (!Array.isArray(value)) {
    if (options.strict) {
      const err = new Error('faq 须为数组')
      err.status = 400
      throw err
    }
    return []
  }
  const items = value.map(normalizeFaqItem).filter(Boolean)
  if (options.strict) {
    validateGeoFaqItems(items, options)
  }
  return items.slice(0, MAX_FAQ_ITEMS)
}

function findGeoFaqViolation(text) {
  const raw = String(text || '')
  return GEO_FAQ_BANNED_PHRASES.find((phrase) => raw.includes(phrase)) || ''
}

/**
 * @param {{ q: string, a: string }[]} items
 * @param {{ requireStoreCheckHint?: boolean, relatedCaseCount?: number }} [options]
 */
function validateGeoFaqItems(items, options = {}) {
  if (!items.length) {
    const err = new Error('至少填写 1 条页内 FAQ')
    err.status = 400
    throw err
  }
  for (const item of items) {
    if (item.q.length > MAX_FAQ_Q_LEN) {
      const err = new Error(`FAQ 问题不超过 ${MAX_FAQ_Q_LEN} 字`)
      err.status = 400
      throw err
    }
    if (item.a.length > MAX_FAQ_A_LEN) {
      const err = new Error(`FAQ 答案不超过 ${MAX_FAQ_A_LEN} 字`)
      err.status = 400
      throw err
    }
    const bannedQ = findGeoFaqViolation(item.q)
    const bannedA = findGeoFaqViolation(item.a)
    if (bannedQ || bannedA) {
      const err = new Error(`FAQ 含不合规表述：${bannedQ || bannedA}`)
      err.status = 400
      throw err
    }
  }
  const requireHint =
    options.requireStoreCheckHint ||
    (options.relatedCaseCount != null && options.relatedCaseCount === 0)
  if (requireHint) {
    const hasHint = items.some(
      (item) => item.a.includes('到店检测') || item.a.includes('到店检查')
    )
    if (!hasHint) {
      const err = new Error('无关联案例时，FAQ 答案须包含「到店检测」或「到店检查」提示')
      err.status = 400
      throw err
    }
  }
  return items
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

function normalizeServiceMeta(value) {
  if (!value || typeof value !== 'object') return {}
  const meta = value
  return {
    serviceItemId: String(meta.serviceItemId || '').trim(),
    displayName: String(meta.displayName || '').trim(),
    priceMode: String(meta.priceMode || 'range').trim(),
    referencePriceHint: String(meta.referencePriceHint || '').trim(),
    process: parseJsonArray(meta.process),
    relatedSlugs: parseJsonArray(meta.relatedSlugs),
  }
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
    serviceMeta: normalizeServiceMeta(row.serviceMetaJson),
    status: row.status || 'draft',
    publishedAt: row.publishedAt ? toIso(row.publishedAt) : '',
    updatedAt: row.updatedAt ? toIso(row.updatedAt) : '',
    createdAt: row.createdAt ? toIso(row.createdAt) : '',
  }
}

function buildGeoPageH5Path(page) {
  const slug = page.slug || page.id
  if (resolveH5ServiceItemBySlug(slug)) {
    return `/service/${slug}.html`
  }
  const meta = page.serviceMeta || {}
  const candidateIds = [
    meta.serviceItemId,
    page.serviceId,
    page.relatedServiceId,
  ].filter((id) => String(id || '').startsWith('item_'))
  for (const itemId of candidateIds) {
    const item = resolveH5ServiceItemById(itemId)
    if (item) {
      const qs = page.city ? `?city=${encodeURIComponent(page.city)}` : ''
      return `/service/${item.slug}.html${qs}`
    }
  }
  const haystack = [page.title, page.summary, ...(page.keywords || [])].join('')
  const matched = H5_SERVICE_ITEMS.find((item) => item.name && haystack.includes(item.name))
  if (matched) {
    const qs = page.city ? `?city=${encodeURIComponent(page.city)}` : ''
    return `/service/${matched.slug}.html${qs}`
  }
  return `/topic/${slug}`
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
    h5Path: buildGeoPageH5Path(page),
    legacyTopicPath: `/topic/${slug}`,
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
  if (payload.serviceMeta != null) data.serviceMetaJson = normalizeServiceMeta(payload.serviceMeta)

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
  normalizeServiceMeta,
  parseJsonArray,
  validateGeoFaqItems,
  findGeoFaqViolation,
  buildGeoPageH5Path,
  MAX_FAQ_ITEMS,
  GEO_FAQ_BANNED_PHRASES,
}
