const { get, post, del } = require('./request')
const { ENV } = require('./config')
const {
  listMockFavorites,
  getMockFavoriteStatus,
  addMockFavorite,
  removeMockFavorite,
} = require('../mock/favorite')

async function fetchUserFavorites(params = {}) {
  if (ENV.mode === 'mock') {
    return listMockFavorites(params)
  }
  return get('/user/favorites', params)
}

async function fetchFavoriteStatus(targetType, targetId) {
  if (ENV.mode === 'mock') {
    return getMockFavoriteStatus(targetType, targetId)
  }
  return get('/user/favorites/status', { targetType, targetId })
}

async function addFavorite(targetType, targetId) {
  if (ENV.mode === 'mock') {
    return addMockFavorite(targetType, targetId)
  }
  return post('/user/favorites', { targetType, targetId }, { showLoading: true, loadingText: '处理中' })
}

async function removeFavorite(targetType, targetId) {
  if (ENV.mode === 'mock') {
    return removeMockFavorite(targetType, targetId)
  }
  return del('/user/favorites', { targetType, targetId }, { showLoading: true, loadingText: '处理中' })
}

module.exports = {
  fetchUserFavorites,
  fetchFavoriteStatus,
  addFavorite,
  removeFavorite,
}
