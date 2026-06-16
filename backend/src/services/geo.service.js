/**
 * GEO-TOPIC-A02 · 专题读服务（聚合案例/门店）
 */
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const {
  PUBLIC_VISIBLE_STATUSES,
  resolveGeoPageRef,
  listGeoPages,
  searchPublishedGeoPages,
} = require('./geo-page-store.service')
const { listCases, listMerchants, getMerchantDetail } = require('./content.service')

const GEO_PAGE_TYPE_LABEL = {
  city_service: '城市服务',
  district_service: '城区服务',
  vehicle_service: '车型服务',
  city_fault: '城市故障',
  fault_qa: '故障问答',
  merchant_geo: '门店专题',
  case_collection: '案例合集',
  case_agg: '案例聚合',
}

function getGeoPageTypeLabel(pageType) {
  return GEO_PAGE_TYPE_LABEL[pageType] || '专题'
}

function isAccidentGeoPage(page) {
  if (!page) return false
  if (page.pageType === 'case_collection' || page.pageType === 'case_agg') {
    const text = [page.title, page.summary, ...(page.keywords || [])].join('')
    return text.includes('事故')
  }
  return false
}

function pickByIds(list, ids) {
  const idSet = new Set(ids || [])
  return (list || []).filter((item) => idSet.has(item.id))
}

async function getGeoPageDetail(ref, options = {}) {
  const page = await resolveGeoPageRef(ref)
  if (!page) {
    const err = new Error('专题不存在或已下线')
    err.status = 404
    throw err
  }

  const publicRead = options.publicRead !== false
  if (publicRead && !PUBLIC_VISIBLE_STATUSES.includes(page.status)) {
    const err = new Error('专题不存在或已下线')
    err.status = 404
    throw err
  }

  const [{ list: allCases }, { list: allStores }] = await Promise.all([
    listCases({ limit: 200 }),
    listMerchants({ limit: 200 }),
  ])

  const relatedCases = pickByIds(allCases, page.relatedCaseIds)
  const relatedStores = pickByIds(allStores, page.relatedStoreIds)

  let primaryStore = null
  if (page.primaryStoreId) {
    try {
      primaryStore = await getMerchantDetail(page.primaryStoreId)
    } catch (e) {
      primaryStore = relatedStores[0] || null
    }
  }

  const slug = page.slug || page.id

  return {
    ...page,
    slug,
    pageTypeLabel: getGeoPageTypeLabel(page.pageType),
    isAccidentTopic: isAccidentGeoPage(page),
    relatedCases,
    relatedStores,
    relatedCaseCount: relatedCases.length,
    relatedStoreCount: relatedStores.length,
    primaryStore,
    h5Path: `/topic/${slug}`,
  }
}

async function findGeoPageOrNull(ref) {
  return resolveGeoPageRef(ref)
}

module.exports = {
  GEO_PAGE_STATUS,
  listGeoPages,
  searchPublishedGeoPages,
  getGeoPageDetail,
  findGeoPageOrNull,
  resolveGeoPageRef,
  getGeoPageTypeLabel,
  isAccidentGeoPage,
  PUBLIC_VISIBLE_STATUSES,
}
