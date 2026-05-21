/**
 * 用户订单维修相册 — D8
 * MOCK: mock/order-album.js；联调后接 GET /api/user/orders/{order_id}/album
 */
const { ENV } = require('./config')
const { get, post } = require('./request')
const {
  mockFetchOrderAlbum,
  mockSubmitAlbumAuthorization,
  mockFetchMerchantOrderAlbum,
  mockSaveMerchantOrderAlbum,
  mockSwitchMerchantOrderAlbumTemplate,
} = require('../mock/order-album')
const { createOrderAuthorizeTaskFromPreMask } = require('./desensitize')

async function fetchOrderAlbum(orderId) {
  if (ENV.mode === 'mock') {
    return mockFetchOrderAlbum(orderId)
  }
  return get(`/user/orders/${orderId}/album`)
}

async function submitAlbumAuthorization(albumId, payload = {}) {
  if (ENV.mode === 'mock') {
    return mockSubmitAlbumAuthorization(albumId, payload)
  }
  return post(`/user/albums/${albumId}/authorization`, payload)
}

/** 用户点「确认公开」：加载预脱敏任务，进入预览工作台 */
async function prepareAuthorizePreview(orderId) {
  if (ENV.mode === 'mock') {
    const album = await mockFetchOrderAlbum(orderId)
    const task = await createOrderAuthorizeTaskFromPreMask({
      bizId: album.albumId,
      orderId,
      nodes: album.nodes,
    })
    return {
      taskId: task.taskId,
      albumId: album.albumId,
      orderId,
      fromPreMask: Boolean(task.fromPreMask),
      preMaskTaskId: task.preMaskTaskId || '',
      preMaskVersion: task.preMaskVersion || 0,
    }
  }
  const data = await post(`/user/orders/${orderId}/album/authorize-preview`)
  return data
}

async function fetchMerchantOrderAlbum(orderId) {
  if (ENV.mode === 'mock') {
    return mockFetchMerchantOrderAlbum(orderId)
  }
  return get(`/merchant/orders/${orderId}/album`)
}

async function saveMerchantOrderAlbum(orderId, payload) {
  if (ENV.mode === 'mock') {
    return mockSaveMerchantOrderAlbum(orderId, payload)
  }
  return post(`/merchant/orders/${orderId}/album`, payload)
}

async function switchMerchantOrderAlbumTemplate(orderId, templateId) {
  if (ENV.mode === 'mock') {
    return mockSwitchMerchantOrderAlbumTemplate(orderId, templateId)
  }
  return post(`/merchant/orders/${orderId}/album/switch-template`, { templateId })
}

module.exports = {
  fetchOrderAlbum,
  submitAlbumAuthorization,
  prepareAuthorizePreview,
  fetchMerchantOrderAlbum,
  saveMerchantOrderAlbum,
  switchMerchantOrderAlbumTemplate,
}
