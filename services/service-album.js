/**
 * V2.0 用户服务相册 — MOCK: mock/service-albums.js
 * 联调后接 GET /api/user/service-albums/*
 */
const { ENV } = require('./config')
const { get, post } = require('./request')
const {
  mockFetchUserServiceAlbums,
  mockFetchServiceAlbum,
  mockSubmitPartConfirm,
  mockSubmitServiceAlbumAuthorization,
  mockFetchUserAuthorizations,
  mockWithdrawAuthorization,
  mockFetchAlbumClaimPreview,
  mockClaimServiceAlbum,
} = require('../mock/service-albums')
const { createServiceAuthorizeTaskFromPreMask } = require('./desensitize')

async function fetchUserServiceAlbums(options = {}) {
  const { normalizeServiceAlbumListTab } = require('../constants/service-album-status')
  const tab = normalizeServiceAlbumListTab(options.tab)
  if (ENV.mode === 'mock') {
    return mockFetchUserServiceAlbums({ ...options, tab })
  }
  return get('/user/service-albums', { ...options, tab })
}

async function fetchServiceAlbum(albumId) {
  if (ENV.mode === 'mock') {
    return mockFetchServiceAlbum(albumId)
  }
  return get(`/user/service-albums/${albumId}`)
}

async function submitPartConfirm(albumId, confirmId, payload = {}) {
  if (ENV.mode === 'mock') {
    return mockSubmitPartConfirm(albumId, confirmId, payload)
  }
  return post(`/user/service-albums/${albumId}/confirm`, {
    confirmId,
    ...payload,
  })
}

async function submitServiceAlbumAuthorization(albumId, payload = {}) {
  if (ENV.mode === 'mock') {
    return mockSubmitServiceAlbumAuthorization(albumId, payload)
  }
  return post(`/user/service-albums/${albumId}/authorization`, payload)
}

async function prepareServiceAuthorizePreview(albumId) {
  if (ENV.mode === 'mock') {
    const album = await mockFetchServiceAlbum(albumId)
    const task = await createServiceAuthorizeTaskFromPreMask({
      bizId: albumId,
      nodes: album.nodes,
    })
    return {
      taskId: task.taskId,
      albumId,
      fromPreMask: Boolean(task.fromPreMask),
      preMaskTaskId: task.preMaskTaskId || '',
      preMaskVersion: task.preMaskVersion || 0,
    }
  }
  return post(`/user/albums/${albumId}/authorize-preview`)
}

async function fetchUserAuthorizations() {
  if (ENV.mode === 'mock') {
    return mockFetchUserAuthorizations()
  }
  return get('/user/service-albums/authorizations')
}

async function withdrawAuthorization(albumId) {
  if (ENV.mode === 'mock') {
    return mockWithdrawAuthorization(albumId)
  }
  return post(`/user/service-albums/${albumId}/withdraw-authorization`)
}

async function recordAlbumShare(albumId, payload = {}) {
  if (ENV.mode === 'mock') {
    const { mockRecordAlbumShare } = require('../mock/service-albums')
    return mockRecordAlbumShare(albumId, payload)
  }
  return post(`/user/service-albums/${albumId}/share`, payload)
}

async function fetchAlbumClaimPreview(albumId) {
  if (ENV.mode === 'mock') {
    return mockFetchAlbumClaimPreview(albumId)
  }
  return get(`/user/service-albums/${albumId}/claim-preview`)
}

async function claimServiceAlbum(albumId, payload = {}) {
  if (ENV.mode === 'mock') {
    return mockClaimServiceAlbum(albumId, payload)
  }
  return post(`/user/service-albums/${albumId}/claim`, payload)
}

async function fetchSharedAlbum(token) {
  if (ENV.mode === 'mock') {
    const { mockFetchSharedAlbum } = require('../mock/service-albums')
    return mockFetchSharedAlbum(token)
  }
  return get(`/user/shared-albums/${encodeURIComponent(token)}`)
}

module.exports = {
  fetchUserServiceAlbums,
  fetchServiceAlbum,
  submitPartConfirm,
  submitServiceAlbumAuthorization,
  prepareServiceAuthorizePreview,
  fetchUserAuthorizations,
  withdrawAuthorization,
  recordAlbumShare,
  fetchSharedAlbum,
  fetchAlbumClaimPreview,
  claimServiceAlbum,
}
