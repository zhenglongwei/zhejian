const { SEED_STORES } = require('./stores')
const { SEED_SERVICES } = require('./services')
const { SEED_CASES } = require('./cases')
const { getSession } = require('../utils/auth')

const STORAGE_KEY = 'mock_user_favorites'

function readStore() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || []
  } catch (e) {
    return []
  }
}

function writeStore(list) {
  wx.setStorageSync(STORAGE_KEY, list)
}

function currentUserId() {
  const { user } = getSession()
  return (user && user.userId) || 'mock_user'
}

function buildStoreItem(storeId) {
  const store = SEED_STORES.find((s) => s.id === storeId)
  if (!store) return null
  return { ...store }
}

function buildServiceItem(serviceId) {
  const service = SEED_SERVICES.find((s) => s.id === serviceId)
  if (!service) return null
  return { ...service }
}

function buildCaseItem(caseId) {
  const item = SEED_CASES.find((c) => c.id === caseId)
  if (!item) return null
  return { ...item }
}

function enrichRow(row) {
  let item = null
  let available = true
  if (row.targetType === 'store') {
    item = buildStoreItem(row.targetId)
    available = Boolean(item && item.status !== 'offline')
  } else if (row.targetType === 'service') {
    item = buildServiceItem(row.targetId)
    available = Boolean(item && item.status === 'published')
  } else {
    item = buildCaseItem(row.targetId)
    available = Boolean(item)
  }
  return {
    favoriteId: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    available,
    unavailableReason: available ? '' : '暂不可用',
    item,
  }
}

function listMockFavorites(params = {}) {
  const type = params.type || 'store'
  const userId = currentUserId()
  const list = readStore()
    .filter((row) => row.userId === userId && row.targetType === type)
    .map(enrichRow)
    .filter((row) => row.item)
  return Promise.resolve({ list, pagination: { page: 1, page_size: 20, total: list.length, has_more: false } })
}

function getMockFavoriteStatus(targetType, targetId) {
  const userId = currentUserId()
  const row = readStore().find(
    (entry) =>
      entry.userId === userId && entry.targetType === targetType && entry.targetId === targetId
  )
  return Promise.resolve({ favorited: Boolean(row), favoriteId: row?.id || '' })
}

function addMockFavorite(targetType, targetId) {
  const userId = currentUserId()
  const list = readStore()
  const existing = list.find(
    (entry) =>
      entry.userId === userId && entry.targetType === targetType && entry.targetId === targetId
  )
  if (existing) {
    return Promise.resolve({ favoriteId: existing.id, favorited: true })
  }
  const row = {
    id: `fav_mock_${Date.now()}`,
    userId,
    targetType,
    targetId,
  }
  writeStore([row, ...list])
  return Promise.resolve({ favoriteId: row.id, favorited: true })
}

function removeMockFavorite(targetType, targetId) {
  const userId = currentUserId()
  writeStore(
    readStore().filter(
      (entry) =>
        !(
          entry.userId === userId &&
          entry.targetType === targetType &&
          entry.targetId === targetId
        )
    )
  )
  return Promise.resolve({ favorited: false })
}

module.exports = {
  listMockFavorites,
  getMockFavoriteStatus,
  addMockFavorite,
  removeMockFavorite,
}
