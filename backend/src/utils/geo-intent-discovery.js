/**
 * GEO-TOPIC-D05 · 首页/城市页意图专题发现过滤
 */
const DISCOVERY_PAGE_TYPES = new Set([
  'city_service',
  'city_fault',
  'fault_qa',
  'district_service',
  'vehicle_service',
  'case_collection',
  'case_agg',
])

const { isPublicDiscoverableGeoPage } = require('./geo-page-service-resolve')

function filterIntentDiscoveryTopics(list, options = {}) {
  const limit = options.limit != null ? Number(options.limit) : 6
  const requireCases = options.requireCases === true

  const filtered = (list || []).filter((item) => {
    if (!item || item.status === 'draft') return false
    if (item.pageType === 'service_base') return false
    if (item.pageType === 'merchant_geo') return false
    if (!DISCOVERY_PAGE_TYPES.has(item.pageType)) return false
    if (!isPublicDiscoverableGeoPage(item)) return false
    if (requireCases && !(item.relatedCaseCount > 0)) return false
    return true
  })

  const ranked = filtered.sort((a, b) => {
    const caseDiff = (b.relatedCaseCount || 0) - (a.relatedCaseCount || 0)
    if (caseDiff !== 0) return caseDiff
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  })

  return ranked.slice(0, Math.max(0, limit))
}

function topicMatchesServiceItem(page, item) {
  if (!page || !item) return false
  const meta = page.serviceMeta || {}
  const ids = [page.serviceId, page.relatedServiceId, meta.serviceItemId].filter(Boolean)
  if (ids.includes(item.serviceItemId)) return true
  const path = String(page.h5Path || '').trim()
  if (path && path.startsWith(`/service/${item.slug}.html`)) return true
  return false
}

function filterTopicsForServiceItem(list, item, options = {}) {
  const limit = options.limit != null ? Number(options.limit) : 12
  if (!item) return []

  const related = (list || []).filter((page) => topicMatchesServiceItem(page, item))
  return filterIntentDiscoveryTopics(related, { limit })
}

module.exports = {
  DISCOVERY_PAGE_TYPES,
  filterIntentDiscoveryTopics,
  filterTopicsForServiceItem,
}
