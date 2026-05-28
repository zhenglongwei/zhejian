/**
 * V2.0 商家服务相册 — API: /api/merchant/service-albums/*
 */
const { ENV } = require('./config')
const { get, post } = require('./request')
const { getProfile } = require('./merchant')
const { getSession } = require('../utils/auth')
const {
  mockFetchMerchantServiceAlbumList,
  mockFetchMerchantServiceAlbum,
  mockCreateMerchantServiceAlbum,
  mockSaveMerchantServiceAlbum,
  mockCompleteMerchantServiceAlbum,
  mockFetchMerchantAlbumStats,
} = require('../mock/service-albums')

function resolveStoreId() {
  const session = getSession()
  if (session.merchant && session.merchant.storeId) {
    return session.merchant.storeId
  }
  const profile = getProfile()
  return (profile && profile.storeId) || ''
}

function withStore(params = {}) {
  const storeId = resolveStoreId()
  if (!storeId) return params
  return { ...params, storeId }
}

async function fetchMerchantServiceAlbumList(options = {}) {
  if (ENV.mode === 'mock') {
    return mockFetchMerchantServiceAlbumList(options)
  }
  return get('/merchant/service-albums', withStore(options))
}

async function fetchMerchantServiceAlbum(albumId) {
  if (ENV.mode === 'mock') {
    return mockFetchMerchantServiceAlbum(albumId)
  }
  return get(`/merchant/service-albums/${albumId}`, withStore())
}

async function createMerchantServiceAlbum(payload) {
  if (ENV.mode === 'mock') {
    return mockCreateMerchantServiceAlbum(payload)
  }
  return post('/merchant/service-albums', withStore(payload))
}

async function saveMerchantServiceAlbum(albumId, payload) {
  if (ENV.mode === 'mock') {
    return mockSaveMerchantServiceAlbum(albumId, payload)
  }
  return post(`/merchant/service-albums/${albumId}`, withStore(payload))
}

async function completeMerchantServiceAlbum(albumId) {
  if (ENV.mode === 'mock') {
    return mockCompleteMerchantServiceAlbum(albumId)
  }
  return post(`/merchant/service-albums/${albumId}/complete`, withStore())
}

async function fetchMerchantAlbumStats() {
  if (ENV.mode === 'mock') {
    return mockFetchMerchantAlbumStats()
  }
  return get('/merchant/service-albums/stats', withStore())
}

module.exports = {
  fetchMerchantServiceAlbumList,
  fetchMerchantServiceAlbum,
  createMerchantServiceAlbum,
  saveMerchantServiceAlbum,
  completeMerchantServiceAlbum,
  fetchMerchantAlbumStats,
}
