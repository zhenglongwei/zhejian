/**
 * V2.0 商家服务相册 — MOCK: mock/service-albums.js
 * 联调后接 GET/POST /api/merchant/service-albums/*
 */
const { ENV } = require('./config')
const { get, post } = require('./request')
const {
  mockFetchMerchantServiceAlbumList,
  mockFetchMerchantServiceAlbum,
  mockCreateMerchantServiceAlbum,
  mockSaveMerchantServiceAlbum,
  mockCompleteMerchantServiceAlbum,
  mockFetchMerchantAlbumStats,
} = require('../mock/service-albums')

async function fetchMerchantServiceAlbumList(options = {}) {
  if (ENV.mode === 'mock') {
    return mockFetchMerchantServiceAlbumList(options)
  }
  return get('/merchant/service-albums', options)
}

async function fetchMerchantServiceAlbum(albumId) {
  if (ENV.mode === 'mock') {
    return mockFetchMerchantServiceAlbum(albumId)
  }
  return get(`/merchant/service-albums/${albumId}`)
}

async function createMerchantServiceAlbum(payload) {
  if (ENV.mode === 'mock') {
    return mockCreateMerchantServiceAlbum(payload)
  }
  return post('/merchant/service-albums', payload)
}

async function saveMerchantServiceAlbum(albumId, payload) {
  if (ENV.mode === 'mock') {
    return mockSaveMerchantServiceAlbum(albumId, payload)
  }
  return post(`/merchant/service-albums/${albumId}`, payload)
}

async function completeMerchantServiceAlbum(albumId) {
  if (ENV.mode === 'mock') {
    return mockCompleteMerchantServiceAlbum(albumId)
  }
  return post(`/merchant/service-albums/${albumId}/complete`)
}

async function fetchMerchantAlbumStats() {
  if (ENV.mode === 'mock') {
    return mockFetchMerchantAlbumStats()
  }
  return get('/merchant/service-albums/stats')
}

module.exports = {
  fetchMerchantServiceAlbumList,
  fetchMerchantServiceAlbum,
  createMerchantServiceAlbum,
  saveMerchantServiceAlbum,
  completeMerchantServiceAlbum,
  fetchMerchantAlbumStats,
}
