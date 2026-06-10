const { resolveCityBySlug } = require('../constants/cities')
const {
  HOME_SERVICE_ENTRIES,
  HOME_ACCIDENT_ENTRY,
  HOME_PLATFORM_INTRO,
  HOME_PROTECTION_TEXT,
} = require('../constants/home')
const { listCases, listMerchants } = require('./content.service')
const { listGeoPages } = require('./geo.service')

/** 首页入口 → H5 服务/案例链接（MVP 种子映射） */
const SERVICE_ENTRY_H5_LINKS = {
  entry_maintenance: '/service/car-maintenance.html',
  entry_brake: '/service/brake-pad-replacement.html',
  entry_accident: '/service/accident-repair.html',
  entry_body: '/service/body-paint-repair.html',
  entry_tire: '/case/',
  entry_battery: '/service/battery-replacement.html',
}

const CITY_FAQ = {
  hangzhou: [
    {
      q: '杭州汽车维修一般怎么选门店？',
      a: '建议先查看公开维修案例了解流程与价格影响因素，再选择可预约的本地门店到店检测。页面案例均已脱敏审核，价格仅供参考。',
    },
    {
      q: '杭州刹车片更换、小保养大概多少钱？',
      a: '费用因车型、配件品牌、损伤程度和门店工时不同而变化，页面展示的价格仅为参考区间，实际费用需到店检测后确认。',
    },
    {
      q: '事故车维修可以在杭州线上确认最终价格吗？',
      a: '事故车维修无法仅凭线上信息准确报价，需到店检测或拆检后确认维修方案和费用。本页案例仅用于了解常见流程。',
    },
    {
      q: '如何在杭州预约本地门店？',
      a: '点击页面中的预约入口，可打开小程序查看门店和服务并提交咨询预约。复杂项目建议先电话或留言确认到店时间。',
    },
  ],
}

function mapFeaturedCase(item) {
  return {
    id: item.id,
    slug: item.slug || (item.seo && item.seo.slug) || '',
    albumId: item.albumId,
    authorizationTier: item.authorizationTier,
    coverImage: item.coverImage || '',
    coverImageDesensitized: item.coverImageDesensitized || item.coverImage || '',
    title: item.title,
    serviceName: item.serviceName,
    summary: item.summary,
    priceMode: item.priceMode || 'range',
    storeId: item.storeId,
    storeName: item.storeName,
    city: item.city || '杭州',
  }
}

function matchesCity(record, cityName) {
  if (!record || !cityName) return false
  if (record.city && record.city === cityName) return true
  if (record.address && String(record.address).includes(cityName)) return true
  return false
}

function buildCitySeo(city, { storeCount, caseCount }) {
  const allowIndex = storeCount > 0 && (caseCount > 0 || storeCount >= 1)
  return {
    title: `${city.name}汽车维修保养_${city.name}汽修门店与维修案例 · 辙见`,
    description: `查看${city.name}汽车维修保养门店、真实维修案例、透明度说明和常见维修问题。公开案例已脱敏审核，价格仅供参考，实际费用以门店检测为准。`,
    canonicalPath: `/city/${city.slug}`,
    robots: allowIndex ? 'index,follow' : 'noindex,follow',
    allowIndex,
  }
}

function mapServiceEntries(entries) {
  return entries
    .filter((e) => e.status === 'enabled')
    .sort((a, b) => a.sort - b.sort)
    .map((entry) => ({
      ...entry,
      h5Path: SERVICE_ENTRY_H5_LINKS[entry.id] || '/case/',
    }))
}

async function getCityPagePayload(citySlug) {
  const city = resolveCityBySlug(citySlug)
  if (!city) {
    const err = new Error('城市不存在或未开通')
    err.status = 404
    throw err
  }
  if (!city.isServiceCity) {
    const err = new Error('该城市暂未开通服务')
    err.status = 404
    throw err
  }

  const [{ list: allCases }, { list: allMerchants }, geoResult] = await Promise.all([
    listCases({ limit: 100 }),
    listMerchants({ limit: 100 }),
    listGeoPages({ limit: 20 }),
  ])

  const cityCases = allCases.filter((item) => matchesCity(item, city.name))
  const cityMerchants = allMerchants.filter((item) => matchesCity(item, city.name))
  const cityGeoTopics = (geoResult.list || []).filter((item) => item.city === city.name)

  const featuredCases = cityCases.slice(0, 6).map(mapFeaturedCase)
  const recommendedMerchants = cityMerchants.slice(0, 6)
  const storeCount = cityMerchants.length
  const caseCount = cityCases.length

  return {
    city: {
      slug: city.slug,
      code: city.code,
      name: city.name,
      isServiceCity: city.isServiceCity,
    },
    serviceEntries: mapServiceEntries(HOME_SERVICE_ENTRIES),
    accidentEntry: HOME_ACCIDENT_ENTRY,
    geoTopics: cityGeoTopics.slice(0, 6),
    recommendedMerchants,
    featuredCases,
    platformIntro: { points: HOME_PLATFORM_INTRO },
    protectionText: HOME_PROTECTION_TEXT,
    priceNotice:
      '案例价格仅为参考区间，复杂维修与事故车需到店检测后确认，实际费用以门店为准。',
    faq: CITY_FAQ[city.slug] || [],
    stats: {
      caseCount,
      storeCount,
    },
    seo: buildCitySeo(city, { storeCount, caseCount }),
  }
}

module.exports = {
  getCityPagePayload,
  SERVICE_ENTRY_H5_LINKS,
}
