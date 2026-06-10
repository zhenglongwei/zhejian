/**
 * DS-C-11 · 案例页内链 payload（门店 / 车型 / 服务 / FAQ）
 */
const { CITIES } = require('../constants/cities')
const { H5_SERVICE_ITEMS } = require('../constants/h5-service-items')
const { resolveAlbumNodeTemplate } = require('../constants/service-album-node-template')
const { matchServiceName } = require('./service-case-link')
const { extractVehicleText } = require('./case-related-cases')
const { GEO_PAGES } = require('../../../mock/geo-pages')

function resolveCityPath(cityName) {
  const name = String(cityName || '').trim()
  if (!name) return ''
  const city = CITIES.find((entry) => entry.name === name)
  return city ? `/city/${city.slug}` : ''
}

function resolveServiceItemId(caseItem, album) {
  if (caseItem.serviceItemId) return caseItem.serviceItemId
  if (album && album.templateId) {
    const tpl = resolveAlbumNodeTemplate({
      templateId: album.templateId,
      serviceName: caseItem.serviceName,
    })
    if (tpl?.serviceItemId) return tpl.serviceItemId
  }
  const serviceName = caseItem.serviceName || ''
  const matched = H5_SERVICE_ITEMS.find((item) => matchServiceName(serviceName, item.name))
  return matched?.serviceItemId || ''
}

function resolveServiceLink(serviceItemId, serviceName) {
  let item = null
  if (serviceItemId) {
    item = H5_SERVICE_ITEMS.find((entry) => entry.serviceItemId === serviceItemId) || null
  }
  if (!item && serviceName) {
    item = H5_SERVICE_ITEMS.find((entry) => matchServiceName(serviceName, entry.name)) || null
  }
  if (!item) return null
  return {
    serviceItemId: item.serviceItemId,
    name: item.name,
    path: `/service/${item.slug}.html`,
    casesPath: `/service/${item.slug}/cases`,
  }
}

function buildVehicleCasesPath(serviceLink, city) {
  if (!serviceLink) return ''
  if (!city) return serviceLink.casesPath
  return `${serviceLink.casesPath}?city=${encodeURIComponent(city)}`
}

function findRelatedGeoTopic(caseItem, serviceLink) {
  const city = caseItem.city || ''
  const keywords = [
    caseItem.serviceName || '',
    serviceLink?.name || '',
  ].filter(Boolean)

  return (
    GEO_PAGES.find((page) => {
      if (city && page.city && page.city !== city) return false
      const haystack = [page.title, page.summary, ...(page.keywords || [])].join('')
      return keywords.some((word) => word && haystack.includes(word.slice(0, 2)))
    }) || null
  )
}

/**
 * @param {object} caseItem
 * @param {{ album?: object|null, showStorePublicly?: boolean, hasFaq?: boolean }} [ctx]
 */
function buildCaseInternalLinks(caseItem, ctx = {}) {
  const album = ctx.album || null
  const showStore = ctx.showStorePublicly !== false && caseItem.authorizationTier !== 'anonymous'
  const city = caseItem.city || ''
  const serviceItemId = resolveServiceItemId(caseItem, album)
  const service = resolveServiceLink(serviceItemId, caseItem.serviceName)
  const vehicleLabel = extractVehicleText(caseItem)
  const cityPath = resolveCityPath(city)
  const geoTopic = findRelatedGeoTopic(caseItem, service)

  const links = []

  if (showStore && caseItem.storeId) {
    links.push({
      type: 'store',
      label: caseItem.storeName || '服务门店',
      hint: '查看门店主页与服务方案',
      path: `/store/${caseItem.storeId}.html`,
    })
    links.push({
      type: 'store_cases',
      label: '本店更多案例',
      hint: '浏览该门店全部公开案例',
      path: `/store/${caseItem.storeId}/cases`,
    })
  }

  if (vehicleLabel) {
    const vehiclePath = buildVehicleCasesPath(service, city) || cityPath || '/case/'
    links.push({
      type: 'vehicle',
      label: vehicleLabel,
      hint: service
        ? `查看更多${service.name}相关案例`
        : city
          ? `查看${city}更多公开案例`
          : '查看更多公开案例',
      path: vehiclePath,
    })
  } else if (cityPath) {
    links.push({
      type: 'city',
      label: `${city}汽车维修`,
      hint: '查看城市门店与专题',
      path: cityPath,
    })
  }

  if (service) {
    links.push({
      type: 'service',
      label: service.name,
      hint: '服务项目说明、流程与参考价格',
      path: service.path,
    })
    links.push({
      type: 'service_cases',
      label: `${service.name}案例列表`,
      hint: '同项目更多脱敏案例',
      path: buildVehicleCasesPath(service, city),
    })
  }

  if (ctx.hasFaq) {
    links.push({
      type: 'faq',
      label: '延伸阅读',
      hint: '公众号科普文章',
      path: '#case-faq',
      isAnchor: true,
    })
  } else if (geoTopic) {
    links.push({
      type: 'faq',
      label: '相关专题 FAQ',
      hint: geoTopic.title,
      path: `/topic/${geoTopic.slug || geoTopic.id}`,
    })
  } else if (service) {
    links.push({
      type: 'faq',
      label: '服务项目 FAQ',
      hint: `了解${service.name}常见问题`,
      path: service.path,
    })
  }

  return {
    store: showStore && caseItem.storeId
      ? {
          id: caseItem.storeId,
          name: caseItem.storeName || '',
          path: `/store/${caseItem.storeId}.html`,
          casesPath: `/store/${caseItem.storeId}/cases`,
        }
      : null,
    vehicle: vehicleLabel
      ? {
          label: vehicleLabel,
          path: buildVehicleCasesPath(service, city) || cityPath || '/case/',
        }
      : cityPath
        ? { label: `${city}本地维修`, path: cityPath }
        : null,
    service,
    faq: ctx.hasFaq
      ? { label: '延伸阅读', path: '#case-faq', isAnchor: true }
      : geoTopic
        ? {
            label: '相关专题',
            path: `/topic/${geoTopic.slug || geoTopic.id}`,
          }
        : service
          ? { label: '服务 FAQ', path: service.path }
          : null,
    city: cityPath ? { name: city, path: cityPath } : null,
    geoTopic: geoTopic
      ? {
          id: geoTopic.id,
          slug: geoTopic.slug || geoTopic.id,
          title: geoTopic.title,
          path: `/topic/${geoTopic.slug || geoTopic.id}`,
        }
      : null,
    links,
    serviceItemId: serviceItemId || '',
  }
}

module.exports = {
  buildCaseInternalLinks,
  resolveServiceItemId,
  resolveServiceLink,
}
