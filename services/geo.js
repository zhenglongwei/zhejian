/**
 * GEO 专题 — prod: GET /api/user/geo-pages*
 */
const { ENV } = require('./config')
const { get } = require('./request')
const { GEO_PAGES } = require('../mock/geo-pages')
const { fetchCaseList } = require('./case')
const { fetchStoreList, fetchStoreDetail } = require('./store')
const { buildStoreCardTags } = require('../utils/store-tags')

function delay(ms = 260) {
  return new Promise((r) => setTimeout(r, ms))
}

function pickByIds(list, ids) {
  const idSet = new Set(ids || [])
  return (list || []).filter((item) => idSet.has(item.id))
}

async function fetchGeoPageDetailMock(id) {
  await delay()
  const page = GEO_PAGES.find((item) => item.id === id)
  if (!page) {
    const err = new Error('专题不存在或已下线')
    err.code = 404
    throw err
  }

  const [{ list: allCases }, { list: allStores }] = await Promise.all([
    fetchCaseList(),
    fetchStoreList(),
  ])

  const relatedCases = pickByIds(allCases, page.relatedCaseIds)
  const relatedStores = pickByIds(allStores, page.relatedStoreIds).map((store) => ({
    ...store,
    cardTags: buildStoreCardTags(store, []),
  }))

  let primaryStore = null
  if (page.primaryStoreId) {
    try {
      primaryStore = await fetchStoreDetail(page.primaryStoreId)
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

async function fetchGeoHomeEntriesMock(limit = 6) {
  await delay()
  return GEO_PAGES.slice(0, limit).map((item) => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    coverImage: item.coverImage || '',
    city: item.city,
    pageType: item.pageType,
    updatedAt: item.updatedAt,
  }))
}

async function fetchGeoPageDetail(id) {
  if (ENV.mode !== 'mock') {
    const data = await get(`/user/geo-pages/${id}`)
    const relatedStores = (data.relatedStores || []).map((store) => ({
      ...store,
      cardTags: buildStoreCardTags(store, []),
    }))
    return {
      ...data,
      relatedStores,
    }
  }
  return fetchGeoPageDetailMock(id)
}

async function fetchGeoHomeEntries(limit = 6) {
  if (ENV.mode !== 'mock') {
    const data = await get('/user/geo-pages', { limit })
    return data.list || []
  }
  return fetchGeoHomeEntriesMock(limit)
}

module.exports = {
  fetchGeoPageDetail,
  fetchGeoHomeEntries,
}
