/**
 * GEO-TOPIC-C01 · 案例 → 服务页 / geo_pages 匹配（城市 + 服务名 + 故障标签）
 */
const { H5_SERVICE_ITEMS, resolveH5ServiceItemById } = require('../constants/h5-service-items')
const { resolveAlbumNodeTemplate } = require('../constants/service-album-node-template')
const { matchServiceName } = require('./service-case-link')
const { buildGeoPageH5Path } = require('../schemas/geo-page.schema')

function buildServicePagePath(slug, city) {
  const base = `/service/${slug}.html`
  const value = String(city || '').trim()
  return value ? `${base}?city=${encodeURIComponent(value)}` : base
}

function resolveServiceItemFromCase(caseItem, album) {
  if (caseItem.serviceItemId) {
    return resolveH5ServiceItemById(caseItem.serviceItemId) || null
  }
  if (album && album.templateId) {
    const tpl = resolveAlbumNodeTemplate({
      templateId: album.templateId,
      serviceName: caseItem.serviceName,
    })
    if (tpl?.serviceItemId) {
      return resolveH5ServiceItemById(tpl.serviceItemId) || null
    }
  }
  const serviceName = caseItem.serviceName || ''
  return H5_SERVICE_ITEMS.find((item) => matchServiceName(serviceName, item.name)) || null
}

function pageServiceItemIds(page) {
  const meta = page.serviceMeta || {}
  return [meta.serviceItemId, page.serviceId, page.relatedServiceId]
    .map((id) => String(id || '').trim())
    .filter((id) => id.startsWith('item_'))
}

function collectCaseFaultText(caseItem) {
  const tags = Array.isArray(caseItem.tags) ? caseItem.tags : []
  return [caseItem.faultDesc, caseItem.title, caseItem.summary, ...tags]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
}

function scoreGeoPageMatch(caseItem, page, serviceItem) {
  let score = 0
  const caseCity = String(caseItem.city || '').trim()
  const pageCity = String(page.city || '').trim()
  const pageType = String(page.pageType || '').trim()
  const serviceIds = pageServiceItemIds(page)

  if (serviceItem) {
    if (page.slug === serviceItem.slug) score += 45
    if (serviceIds.includes(serviceItem.serviceItemId)) score += 40
    const haystack = [page.title, page.summary, ...(page.keywords || [])].join('')
    if (haystack.includes(serviceItem.name)) score += 12
    if (matchServiceName(caseItem.serviceName, serviceItem.name)) score += 18
  }

  if (caseCity && pageCity) {
    if (caseCity !== pageCity) return -1
    score += 28
  }

  if (page.faultTag) {
    const faultText = collectCaseFaultText(caseItem)
    if (faultText.includes(page.faultTag)) score += 22
  }

  if (pageType === 'city_service' && caseCity && pageCity === caseCity) score += 50
  if (pageType === 'service_base' && serviceItem && page.slug === serviceItem.slug) score += 8
  if (pageType === 'fault_qa' && page.faultTag) score += 6

  if (!serviceItem && caseItem.serviceName) {
    const haystack = [page.title, page.summary, ...(page.keywords || [])].join('')
    if (matchServiceName(caseItem.serviceName, haystack)) score += 15
  }

  return score
}

/**
 * @param {object} caseItem
 * @param {object[]} geoPages — mapGeoPageRow 结果
 * @param {{ album?: object|null, serviceItem?: object|null }} [options]
 */
function matchCaseToGeoPages(caseItem, geoPages = [], options = {}) {
  const serviceItem =
    options.serviceItem || resolveServiceItemFromCase(caseItem, options.album || null)

  const ranked = (geoPages || [])
    .map((page) => ({ page, score: scoreGeoPageMatch(caseItem, page, serviceItem) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  const bestGeoPage = ranked[0]?.page || null
  const servicePath = serviceItem
    ? buildServicePagePath(serviceItem.slug, caseItem.city)
    : ''

  return {
    serviceItem,
    servicePath,
    bestGeoPage,
    geoPages: ranked.map((entry) => entry.page),
    score: ranked[0]?.score || 0,
  }
}

function mapGeoPageLink(page, caseItem) {
  if (!page) return null
  return {
    id: page.id,
    slug: page.slug || page.id,
    title: page.title || '',
    summary: page.summary || '',
    path: buildGeoPageH5Path(page) || buildServicePagePath(page.slug, caseItem.city),
    pageType: page.pageType || '',
    city: page.city || '',
  }
}

/**
 * 案例发布时写入 geo_pages.related_case_ids 的目标页
 * @param {object} caseItem
 * @param {object[]} geoPages
 * @param {{ album?: object|null }} [options]
 */
function matchGeoPagesForCaseMount(caseItem, geoPages = [], options = {}) {
  const { serviceItem, geoPages: ranked } = matchCaseToGeoPages(caseItem, geoPages, options)
  const targets = new Set()
  const caseCity = String(caseItem.city || '').trim()

  if (serviceItem) {
    const serviceBase = (geoPages || []).find((page) => page.slug === serviceItem.slug)
    if (serviceBase) targets.add(serviceBase.id)
  }

  ranked.forEach((page) => {
    if (page.pageType === 'service_base') {
      targets.add(page.id)
      return
    }
    if (caseCity && page.city === caseCity) targets.add(page.id)
  })

  return [...targets]
}

function orderCasesByIds(cases, ids, limit) {
  const idList = Array.isArray(ids) ? ids : []
  const map = new Map((cases || []).map((item) => [item.id, item]))
  const ordered = idList.map((id) => map.get(id)).filter(Boolean)
  const seen = new Set(ordered.map((item) => item.id))
  const rest = (cases || []).filter((item) => !seen.has(item.id))
  return [...ordered, ...rest].slice(0, limit)
}

module.exports = {
  buildServicePagePath,
  resolveServiceItemFromCase,
  matchCaseToGeoPages,
  matchGeoPagesForCaseMount,
  mapGeoPageLink,
  orderCasesByIds,
}
