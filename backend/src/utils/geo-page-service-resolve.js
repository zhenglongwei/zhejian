/**
 * GEO 专题 → 服务项目页路径解析（buildGeoPageH5Path / topic-redirect 共用）
 */
const {
  resolveH5ServiceItemBySlug,
  resolveH5ServiceItemById,
  H5_SERVICE_ITEMS,
} = require('../constants/h5-service-items')

/** 旧 /topic/ URL → 固定跳转（mock 遗留、外链收录） */
const LEGACY_TOPIC_REDIRECTS = {
  'bmw-3-series-maintenance': { kind: 'service', serviceSlug: 'car-maintenance', city: '杭州' },
  'hangzhou-accident-guide': { kind: 'service', serviceSlug: 'accident-repair', city: '杭州' },
  'hangzhou-body-paint': { kind: 'service', serviceSlug: 'body-paint-repair', city: '杭州' },
  'hangzhou-binjiang-stores': { kind: 'city', citySlug: 'hangzhou' },
  'store-demo-hangzhou': { kind: 'store', storeId: 'store_demo_1' },
  'ac-not-cooling-guide': { kind: 'home' },
}

/** 标题/关键词文本 → 服务 catalog 名（精确匹配失败时的同义词） */
const SERVICE_NAME_SYNONYMS = [
  { pattern: /钣金喷漆|钣金修复|补漆/, serviceName: '钣喷修复' },
  { pattern: /事故车|事故维修/, serviceName: '事故车维修' },
  { pattern: /电瓶|蓄电池/, serviceName: '电瓶更换' },
  { pattern: /刹车片|刹车更换/, serviceName: '刹车片更换' },
]

const VEHICLE_SERVICE_RULES = [
  { pattern: /刹车|制动/, serviceSlug: 'brake-pad-replacement' },
  { pattern: /保养|机油/, serviceSlug: 'car-maintenance' },
  { pattern: /电瓶|蓄电池/, serviceSlug: 'battery-replacement' },
  { pattern: /钣喷|喷漆|钣金/, serviceSlug: 'body-paint-repair' },
  { pattern: /事故/, serviceSlug: 'accident-repair' },
]

function buildServiceLocation(serviceSlug, city = '') {
  const qs = String(city || '').trim() ? `?city=${encodeURIComponent(city)}` : ''
  return `/service/${serviceSlug}.html${qs}`
}

function resolveLegacyTopicRedirect(slug) {
  const key = String(slug || '').trim()
  if (!key) return null
  const rule = LEGACY_TOPIC_REDIRECTS[key]
  if (!rule) return null

  if (rule.kind === 'service') {
    return { location: buildServiceLocation(rule.serviceSlug, rule.city), status: 301 }
  }
  if (rule.kind === 'store' && rule.storeId) {
    return { location: `/store/${rule.storeId}.html`, status: 301 }
  }
  if (rule.kind === 'city' && rule.citySlug) {
    return { location: `/city/${rule.citySlug}`, status: 301 }
  }
  if (rule.kind === 'home') {
    return { location: '/', status: 302 }
  }
  return null
}

function collectPageHaystack(page) {
  return [page.title, page.summary, page.faultTag, page.vehicleSeries, ...(page.keywords || [])]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join('')
}

function matchServiceItemByText(page) {
  const haystack = collectPageHaystack(page)
  if (!haystack) return null

  const direct = H5_SERVICE_ITEMS.find((item) => item.name && haystack.includes(item.name))
  if (direct) return direct

  for (const rule of SERVICE_NAME_SYNONYMS) {
    if (!rule.pattern.test(haystack)) continue
    const item = H5_SERVICE_ITEMS.find((entry) => entry.name === rule.serviceName)
    if (item) return item
  }

  return null
}

function matchVehicleServiceSlug(page) {
  if (page.pageType !== 'vehicle_service') return ''
  const haystack = collectPageHaystack(page)
  if (!haystack) return ''
  const rule = VEHICLE_SERVICE_RULES.find((entry) => entry.pattern.test(haystack))
  return rule ? rule.serviceSlug : 'car-maintenance'
}

function resolveServiceSlugFromGeoPage(page) {
  if (!page) return ''

  if (page.pageType === 'service_base' && resolveH5ServiceItemBySlug(page.slug)) {
    return page.slug
  }

  const meta = page.serviceMeta || {}
  const candidateIds = [meta.serviceItemId, page.serviceId, page.relatedServiceId].filter((id) =>
    String(id || '').startsWith('item_')
  )

  for (const itemId of candidateIds) {
    const item = resolveH5ServiceItemById(itemId)
    if (item) return item.slug
  }

  if (resolveH5ServiceItemBySlug(page.slug)) return page.slug

  const vehicleSlug = matchVehicleServiceSlug(page)
  if (vehicleSlug) return vehicleSlug

  const matched = matchServiceItemByText(page)
  return matched ? matched.slug : ''
}

function buildGeoPageServicePath(page) {
  const slug = page.slug || page.id
  if (!slug) return ''

  const legacy = resolveLegacyTopicRedirect(slug)
  if (legacy) return legacy.location

  if (resolveH5ServiceItemBySlug(slug)) {
    return `/service/${slug}.html`
  }

  const serviceSlug = resolveServiceSlugFromGeoPage(page)
  if (!serviceSlug) return ''

  const city = String(page.city || '').trim()
  return buildServiceLocation(serviceSlug, city)
}

function isPublicDiscoverableGeoPage(page) {
  if (!page || page.status === 'draft') return false
  if (page.pageType === 'service_base' || page.pageType === 'merchant_geo') return false
  const path = buildGeoPageServicePath(page)
  return Boolean(path && path.startsWith('/service/'))
}

module.exports = {
  LEGACY_TOPIC_REDIRECTS,
  buildServiceLocation,
  resolveLegacyTopicRedirect,
  resolveServiceSlugFromGeoPage,
  buildGeoPageServicePath,
  isPublicDiscoverableGeoPage,
}
