/** H5 城市 slug 表 — MVP 仅杭州；与 utils/city-location.js DEFAULT_CITY 对齐 */
const CITIES = [
  {
    slug: 'hangzhou',
    code: 'hangzhou',
    name: '杭州',
    isServiceCity: true,
  },
]

function resolveCityBySlug(slug) {
  const normalized = String(slug || '')
    .trim()
    .toLowerCase()
  if (!normalized) return null
  return CITIES.find((c) => c.slug === normalized) || null
}

function listServiceCities() {
  return CITIES.filter((c) => c.isServiceCity)
}

module.exports = {
  CITIES,
  resolveCityBySlug,
  listServiceCities,
}
