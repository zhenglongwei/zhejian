/**
 * 专题 URL 收敛至服务项目页：/topic/{slug} → /service/{service_slug}.html
 */
const { resolveGeoPageRef } = require('./geo-page-store.service')
const { resolveH5ServiceItemBySlug } = require('../constants/h5-service-items')
const {
  resolveLegacyTopicRedirect,
  buildGeoPageServicePath,
  resolveServiceSlugFromGeoPage,
} = require('../utils/geo-page-service-resolve')

/**
 * @param {string} slugOrId
 * @returns {Promise<{ location: string, status: number } | null>}
 */
async function resolveTopicRedirectTarget(slugOrId) {
  const slug = String(slugOrId || '').trim()
  if (!slug) return null

  const legacy = resolveLegacyTopicRedirect(slug)
  if (legacy) return legacy

  const catalog = resolveH5ServiceItemBySlug(slug)
  if (catalog) {
    return { location: `/service/${catalog.slug}.html`, status: 301 }
  }

  const page = await resolveGeoPageRef(slug)
  if (page) {
    const path = buildGeoPageServicePath(page)
    if (path && path.startsWith('/service/')) {
      return { location: path, status: 301 }
    }
  }

  return null
}

module.exports = {
  resolveTopicRedirectTarget,
  resolveServiceSlugFromGeoPage,
}
