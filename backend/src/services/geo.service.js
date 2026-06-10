const { GEO_PAGES } = require('../../../mock/geo-pages')
const { listCases, listMerchants, getMerchantDetail } = require('./content.service')

const GEO_PAGE_TYPE_LABEL = {
  city_service: '城市服务',
  district_service: '城区服务',
  vehicle_service: '车型服务',
  fault_qa: '故障问答',
  merchant_geo: '门店专题',
  case_collection: '案例合集',
}

function resolveGeoPageRef(ref) {
  const normalized = String(ref || '').trim()
  if (!normalized) return null
  return (
    GEO_PAGES.find((item) => item.slug === normalized || item.id === normalized) || null
  )
}

function getGeoPageTypeLabel(pageType) {
  return GEO_PAGE_TYPE_LABEL[pageType] || '专题'
}

function isAccidentGeoPage(page) {
  if (!page) return false
  if (page.pageType === 'case_collection') {
    const text = [page.title, page.summary, ...(page.keywords || [])].join('')
    return text.includes('事故')
  }
  return false
}

function pickByIds(list, ids) {
  const idSet = new Set(ids || [])
  return (list || []).filter((item) => idSet.has(item.id))
}

function mapGeoListItem(page) {
  const slug = page.slug || page.id
  return {
    id: page.id,
    slug,
    title: page.title,
    summary: page.summary,
    coverImage: page.coverImage || '',
    city: page.city,
    pageType: page.pageType,
    updatedAt: page.updatedAt,
    h5Path: `/topic/${slug}`,
  }
}

async function listGeoPages(query = {}) {
  let list = GEO_PAGES.map(mapGeoListItem)
  const limit = query.limit != null ? parseInt(String(query.limit), 10) : 0
  if (limit > 0) {
    list = list.slice(0, limit)
  }
  return { list, total: GEO_PAGES.length }
}

async function getGeoPageDetail(ref) {
  const page = resolveGeoPageRef(ref)
  if (!page) {
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

function findGeoPageOrNull(ref) {
  return resolveGeoPageRef(ref)
}

module.exports = {
  listGeoPages,
  getGeoPageDetail,
  findGeoPageOrNull,
  resolveGeoPageRef,
  getGeoPageTypeLabel,
  isAccidentGeoPage,
}
