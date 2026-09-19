const { HOME_SERVICE_ENTRIES } = require('./home')
const { H5_SERVICE_ITEMS } = require('./h5-service-items')
const { listServiceCities } = require('./cities')

/** 首页入口 → H5 服务/案例链接（与 h5-city.service 共用） */
const SERVICE_ENTRY_H5_LINKS = {
  entry_maintenance: '/topic/car-maintenance',
  entry_brake: '/topic/brake-pad-replacement',
  entry_accident: '/topic/accident-repair',
  entry_body: '/topic/body-paint-repair',
  entry_tire: '/case/',
  entry_battery: '/topic/battery-replacement',
}

function mapHomeServiceEntries() {
  return HOME_SERVICE_ENTRIES.filter((entry) => entry.status === 'enabled')
    .sort((a, b) => a.sort - b.sort)
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      h5Path: SERVICE_ENTRY_H5_LINKS[entry.id] || '/case/',
    }))
}

function buildServiceNavLinks() {
  return H5_SERVICE_ITEMS.map((item) => ({
    slug: item.slug,
    name: item.name,
    path: `/topic/${item.slug}`,
    casesPath: `/topic/${item.slug}`,
  }))
}

function buildCityNavLinks() {
  return listServiceCities().map((city) => ({
    slug: city.slug,
    name: city.name,
    path: `/city/${city.slug}`,
  }))
}

module.exports = {
  SERVICE_ENTRY_H5_LINKS,
  mapHomeServiceEntries,
  buildServiceNavLinks,
  buildCityNavLinks,
}
