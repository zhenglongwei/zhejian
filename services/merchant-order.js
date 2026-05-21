/**
 * 商家订单履约 — D9
 * MOCK: mock/merchant-order.js；联调后接 /api/merchant/orders/*
 */
const { ENV } = require('./config')
const { get, post } = require('./request')
const { fetchMerchantProfile } = require('./merchant')
const {
  mockFetchMerchantOrders,
  mockFetchMerchantOrderDetail,
  mockAcceptOrder,
  mockRejectOrder,
  mockRescheduleOrder,
  mockMarkOrderArrived,
  mockStartOrderRepair,
  mockSubmitOrderComplete,
  mockFetchMerchantOrderStats,
} = require('../mock/merchant-order')

async function resolveStoreId() {
  const profile = await fetchMerchantProfile()
  return (profile && profile.storeId) || ''
}

async function fetchMerchantOrders(params = {}) {
  const storeId = params.storeId || (await resolveStoreId())
  if (ENV.mode === 'mock') {
    return mockFetchMerchantOrders({ ...params, storeId })
  }
  const data = await get('/merchant/orders', { ...params, storeId })
  return data.list || data
}

async function fetchMerchantOrderDetail(orderId) {
  const storeId = await resolveStoreId()
  if (ENV.mode === 'mock') {
    return mockFetchMerchantOrderDetail(orderId, storeId)
  }
  return get(`/merchant/orders/${orderId}`)
}

async function acceptOrder(orderId) {
  const storeId = await resolveStoreId()
  if (ENV.mode === 'mock') {
    return mockAcceptOrder(orderId, storeId)
  }
  return post(`/merchant/orders/${orderId}/accept`)
}

async function rejectOrder(orderId, payload) {
  const storeId = await resolveStoreId()
  if (ENV.mode === 'mock') {
    return mockRejectOrder(orderId, storeId, payload)
  }
  return post(`/merchant/orders/${orderId}/reject`, payload)
}

async function rescheduleOrder(orderId, payload) {
  const storeId = await resolveStoreId()
  if (ENV.mode === 'mock') {
    return mockRescheduleOrder(orderId, storeId, payload)
  }
  return post(`/merchant/orders/${orderId}/reschedule`, payload)
}

async function markOrderArrived(orderId) {
  const storeId = await resolveStoreId()
  if (ENV.mode === 'mock') {
    return mockMarkOrderArrived(orderId, storeId)
  }
  return post(`/merchant/orders/${orderId}/arrive`)
}

async function startOrderRepair(orderId) {
  const storeId = await resolveStoreId()
  if (ENV.mode === 'mock') {
    return mockStartOrderRepair(orderId, storeId)
  }
  return post(`/merchant/orders/${orderId}/start-repair`)
}

async function submitOrderComplete(orderId, payload) {
  const storeId = await resolveStoreId()
  if (ENV.mode === 'mock') {
    return mockSubmitOrderComplete(orderId, storeId, payload)
  }
  return post(`/merchant/orders/${orderId}/complete`, payload)
}

async function fetchMerchantOrderStats() {
  const storeId = await resolveStoreId()
  if (ENV.mode === 'mock') {
    return mockFetchMerchantOrderStats(storeId)
  }
  return get('/merchant/orders/stats', { storeId })
}

module.exports = {
  fetchMerchantOrders,
  fetchMerchantOrderDetail,
  acceptOrder,
  rejectOrder,
  rescheduleOrder,
  markOrderArrived,
  startOrderRepair,
  submitOrderComplete,
  fetchMerchantOrderStats,
}
