/**
 * DS-C-11 · 案例页内链 payload（门店 / 车型 / 服务 / FAQ）
 */
const { CITIES } = require('../constants/cities')
const { H5_SERVICE_ITEMS } = require('../constants/h5-service-items')
const { resolveAlbumNodeTemplate } = require('../constants/service-album-node-template')
const { matchServiceName } = require('./service-case-link')
const { extractVehicleText } = require('./case-related-cases')
const {
  buildServicePagePath,
  matchCaseToGeoPages,
  mapGeoPageLink,
} = require('./geo-topic-matcher')

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

function inferServicePlanId(album, caseItem) {
  const fromAlbum = String(album?.serviceId || '').trim()
  if (fromAlbum) return fromAlbum
  const id = String(album?.id || caseItem?.albumId || caseItem?.id || '').trim()
  const match = id.match(/(?:^|_)(svc_[a-z0-9_]+)$/i)
  return match ? match[1] : ''
}

function resolveMerchantServicePlanLink(album, caseItem, serviceName) {
  const planId = inferServicePlanId(album, caseItem)
  if (!planId) return null
  const name =
    String(serviceName || album?.serviceName || caseItem?.serviceName || '').trim() ||
    '服务详情'
  return {
    serviceItemId: '',
    name,
    path: `/service/${encodeURIComponent(planId)}.html`,
    casesPath: '',
    isMerchantPlan: true,
  }
}

function resolveServiceLink(serviceItemId, serviceName, album, caseItem) {
  let item = null
  if (serviceItemId) {
    item = H5_SERVICE_ITEMS.find((entry) => entry.serviceItemId === serviceItemId) || null
  }
  if (!item && serviceName) {
    item = H5_SERVICE_ITEMS.find((entry) => matchServiceName(serviceName, entry.name)) || null
  }
  if (item) {
    const city = caseItem && caseItem.city ? caseItem.city : ''
    return {
      serviceItemId: item.serviceItemId,
      name: item.name,
      path: buildServicePagePath(item.slug, city),
      casesPath: `/service/${item.slug}/cases`,
      isMerchantPlan: false,
    }
  }
  return resolveMerchantServicePlanLink(album, caseItem, serviceName)
}

function buildVehicleCasesPath(serviceLink, city) {
  if (!serviceLink) return ''
  if (!serviceLink.casesPath) return serviceLink.path || ''
  if (!city) return serviceLink.casesPath
  return `${serviceLink.casesPath}?city=${encodeURIComponent(city)}`
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
  const service = resolveServiceLink(serviceItemId, caseItem.serviceName, album, caseItem)
  const vehicleLabel = extractVehicleText(caseItem)
  const cityPath = resolveCityPath(city)
  const geoMatch = matchCaseToGeoPages(caseItem, ctx.geoPages, { album })
  const geoTopic = mapGeoPageLink(geoMatch.bestGeoPage, caseItem)

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
      hint: '查看城市门店与服务',
      path: cityPath,
    })
  }

  if (service) {
    links.push({
      type: 'service',
      label: service.name,
      hint: service.isMerchantPlan
        ? '查看门店服务方案详情'
        : '服务项目说明、流程与参考价格',
      path: service.path,
    })
    if (service.casesPath) {
      links.push({
        type: 'service_cases',
        label: `${service.name}案例列表`,
        hint: '同项目更多脱敏案例',
        path: buildVehicleCasesPath(service, city),
      })
    }
  }

  if (geoTopic) {
    links.push({
      type: 'geo',
      label: geoTopic.title || service?.name || '相关专题',
      hint: '阅读专题说明与相关案例',
      path: geoTopic.path,
    })
  } else if (service) {
    links.push({
      type: 'geo',
      label: `${service.name}专题`,
      hint: '查看服务项目相关专题',
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
    geoTopic: geoTopic
      ? {
          title: geoTopic.title || '相关专题',
          path: geoTopic.path,
        }
      : service
        ? {
            title: `${service.name}专题`,
            path: service.path,
          }
        : null,
    city: cityPath ? { name: city, path: cityPath } : null,
    relatedService: geoMatch.serviceItem
      ? {
          slug: geoMatch.serviceItem.slug,
          name: geoMatch.serviceItem.name,
          path: geoMatch.servicePath || service?.path || '',
        }
      : service
        ? {
            slug: '',
            name: service.name,
            path: service.path,
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
  resolveMerchantServicePlanLink,
  inferServicePlanId,
}
