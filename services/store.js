/**
 * 门店服务 — mock + API
 * prod/dev: GET /api/user/merchants、/merchants/:id
 */
const { ENV } = require('./config')
const { get } = require('./request')
const { SEED_STORES } = require('../mock/stores')
const { getProfile } = require('./merchant')

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms))
}

function mergeStoreProfile(seed) {
  const profile = getProfile()
  if (!profile || profile.storeId !== seed.id) {
    return { ...seed }
  }
  return {
    ...seed,
    name: profile.storeName || seed.name,
    address: profile.address || seed.address,
    phone: profile.phone || seed.phone,
  }
}

function findStore(id) {
  const seed = SEED_STORES.find((s) => s.id === id)
  if (!seed) return null
  return mergeStoreProfile(seed)
}

/**
 * @param {string} storeId
 */
async function fetchStoreDetail(storeId) {
  if (ENV.mode !== 'mock') {
    return get(`/user/merchants/${storeId}`)
  }
  await delay()
  const store = findStore(storeId)
  if (!store) {
    const err = new Error('门店不存在')
    err.code = 404
    throw err
  }
  if (store.status === 'offline') {
    const err = new Error('该门店暂不可查看')
    err.code = 410
    throw err
  }
  return store
}

/**
 * 用户端 — 门店列表（首页推荐等）
 * @param {{ limit?: number, status?: string }} [query]
 */
async function fetchStoreList(query = {}) {
  if (ENV.mode !== 'mock') {
    return get('/user/merchants', query)
  }
  await delay()
  let list = SEED_STORES.map(mergeStoreProfile).filter((s) => s.status !== 'offline')
  if (query.status) {
    list = list.filter((s) => s.status === query.status)
  }
  list.sort((a, b) => {
    const scoreDiff = (b.score || 0) - (a.score || 0)
    if (scoreDiff !== 0) return scoreDiff
    return (b.caseCount || 0) - (a.caseCount || 0)
  })
  if (query.limit != null && query.limit > 0) {
    list = list.slice(0, query.limit)
  }
  return { list, total: list.length }
}

module.exports = {
  fetchStoreDetail,
  fetchStoreList,
  findStore,
}
