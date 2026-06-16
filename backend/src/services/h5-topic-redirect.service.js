/**
 * 专题 URL 收敛至服务项目页：/topic/{slug} → /service/{service_slug}.html
 */
const { resolveGeoPageRef } = require('./geo-page-store.service')
const {
  resolveH5ServiceItemBySlug,
  resolveH5ServiceItemById,
  H5_SERVICE_ITEMS,
} = require('../constants/h5-service-items')

function matchServiceItemByText(page) {
  const haystack = [page.title, page.summary, ...(page.keywords || [])].join('')
  return H5_SERVICE_ITEMS.find((item) => item.name && haystack.includes(item.name)) || null
}

function resolveServiceSlugFromGeoPage(page) {
  if (!page) return ''

  if (page.pageType === 'service_base' && resolveH5ServiceItemBySlug(page.slug)) {
    return page.slug
  }

  const meta = page.serviceMeta || {}
  const candidateIds = [
    meta.serviceItemId,
    page.serviceId,
    page.relatedServiceId,
  ].filter((id) => String(id || '').startsWith('item_'))

  for (const itemId of candidateIds) {
    const item = resolveH5ServiceItemById(itemId)
    if (item) return item.slug
  }

  if (resolveH5ServiceItemBySlug(page.slug)) return page.slug

  const matched = matchServiceItemByText(page)
  return matched ? matched.slug : ''
}

/**
 * @param {string} slugOrId
 * @returns {Promise<{ location: string, status: number } | null>}
 */
async function resolveTopicRedirectTarget(slugOrId) {
  const slug = String(slugOrId || '').trim()
  if (!slug) return null

  const catalog = resolveH5ServiceItemBySlug(slug)
  if (catalog) {
    return { location: `/service/${catalog.slug}.html`, status: 301 }
  }

  const page = await resolveGeoPageRef(slug)
  if (page) {
    const serviceSlug = resolveServiceSlugFromGeoPage(page)
    if (serviceSlug) {
      const city = String(page.city || '').trim()
      const qs = city ? `?city=${encodeURIComponent(city)}` : ''
      return { location: `/service/${serviceSlug}.html${qs}`, status: 301 }
    }
  }

  return null
}

module.exports = {
  resolveTopicRedirectTarget,
  resolveServiceSlugFromGeoPage,
}
