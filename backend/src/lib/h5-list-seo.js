/**
 * H5 列表页 SEO：canonical 固定为无参主列表；筛选/分页变体 noindex + rel prev/next
 */

function buildListPageSeo({
  canonicalPath,
  allowIndex,
  page = 1,
  hasFilters = false,
  hasMore = false,
  buildPagePath,
}) {
  const isPrimaryView = page === 1 && !hasFilters
  const robots = allowIndex && isPrimaryView ? 'index,follow' : 'noindex,follow'

  let prevPath = null
  let nextPath = null
  if (typeof buildPagePath === 'function') {
    if (page > 1) prevPath = buildPagePath({ page: page - 1 })
    if (hasMore) nextPath = buildPagePath({ page: page + 1 })
  }

  return {
    canonicalPath,
    robots,
    allowIndex: Boolean(allowIndex && isPrimaryView),
    isPrimaryView,
    prevPath,
    nextPath,
  }
}

function buildStoreCasesPagePath(storeId, { page = 1, serviceName = '' } = {}) {
  const qs = []
  if (page > 1) qs.push(`page=${page}`)
  if (serviceName) qs.push(`serviceName=${encodeURIComponent(serviceName)}`)
  const base = `/store/${storeId}/cases`
  return qs.length ? `${base}?${qs.join('&')}` : base
}

function buildServiceItemCasesPagePath(slug, { page = 1, city = '', storeId = '' } = {}) {
  const qs = []
  if (page > 1) qs.push(`page=${page}`)
  if (city) qs.push(`city=${encodeURIComponent(city)}`)
  if (storeId) qs.push(`storeId=${encodeURIComponent(storeId)}`)
  const base = `/service/${slug}/cases`
  return qs.length ? `${base}?${qs.join('&')}` : base
}

module.exports = {
  buildListPageSeo,
  buildStoreCasesPagePath,
  buildServiceItemCasesPagePath,
}
