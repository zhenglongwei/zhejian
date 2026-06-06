const { GEO_PAGES } = require('../../../mock/geo-pages')
const { listCases, listMerchants, getMerchantDetail } = require('./content.service')

function pickByIds(list, ids) {
  const idSet = new Set(ids || [])
  return (list || []).filter((item) => idSet.has(item.id))
}

function mapGeoListItem(page) {
  return {
    id: page.id,
    title: page.title,
    summary: page.summary,
    coverImage: page.coverImage || '',
    city: page.city,
    pageType: page.pageType,
    updatedAt: page.updatedAt,
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

async function getGeoPageDetail(id) {
  const page = GEO_PAGES.find((item) => item.id === id)
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

  return {
    ...page,
    relatedCases,
    relatedStores,
    relatedCaseCount: relatedCases.length,
    relatedStoreCount: relatedStores.length,
    primaryStore,
  }
}

function findGeoPageOrNull(id) {
  return GEO_PAGES.find((item) => item.id === id) || null
}

module.exports = {
  listGeoPages,
  getGeoPageDetail,
  findGeoPageOrNull,
}
