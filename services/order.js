/**
 * 用户订单 — D6 + D7
 * MOCK: 联调后接 /api/user/orders 等
 */
const { ENV } = require('./config')
const { get, post } = require('./request')
const { ORDER_TYPE } = require('../constants/order-type')
const { isBookingOrderType } = require('../utils/order-form')
const { filterOrdersByTab } = require('../utils/order-display')
const {
  mockFetchOrderConfirm,
  mockCreateOrder,
  mockCreateBooking,
  mockPayOrder,
  mockGetOrder,
  mockGetOrderDetail,
  mockFetchOrderProgress,
  mockConfirmOrderFinish,
  mockCancelOrder,
  loadOrders,
} = require('../mock/orders')

async function fetchOrderConfirm(params) {
  if (ENV.mode === 'mock') {
    return mockFetchOrderConfirm(params)
  }
  return get('/user/order-confirm', params)
}

async function submitOrderConfirm(payload) {
  const { orderType } = payload
  if (ENV.mode === 'mock') {
    if (isBookingOrderType(orderType)) {
      const order = await mockCreateBooking(payload, orderType)
      return { order, paid: false }
    }
    const order = await mockCreateOrder(payload)
    const paid = await mockPayOrder(order.id)
    return { order: paid, paid: true }
  }
  if (isBookingOrderType(orderType)) {
    const order = await post('/user/bookings', payload)
    return { order, paid: false }
  }
  const order = await post('/user/orders', payload)
  const paid = await post(`/user/orders/${order.id}/pay`)
  return { order: paid, paid: true }
}

async function fetchOrderById(orderId) {
  if (ENV.mode === 'mock') {
    return mockGetOrderDetail(orderId)
  }
  return get(`/user/orders/${orderId}`)
}

async function fetchUserOrders(params = {}) {
  if (ENV.mode === 'mock') {
    await new Promise((r) => setTimeout(r, 200))
    const list = loadOrders()
    const { tab } = params
    return tab ? filterOrdersByTab(list, tab) : list
  }
  const data = await get('/user/orders', params)
  const list = data.list || data
  return params.tab ? filterOrdersByTab(list, params.tab) : list
}

async function fetchOrderProgress(orderId) {
  if (ENV.mode === 'mock') {
    return mockFetchOrderProgress(orderId)
  }
  return get(`/user/orders/${orderId}/progress`)
}

async function confirmOrderFinish(orderId) {
  if (ENV.mode === 'mock') {
    return mockConfirmOrderFinish(orderId)
  }
  return post(`/user/orders/${orderId}/confirm-finish`)
}

async function cancelUserOrder(orderId) {
  if (ENV.mode === 'mock') {
    return mockCancelOrder(orderId)
  }
  return post(`/user/orders/${orderId}/cancel`)
}

module.exports = {
  fetchOrderConfirm,
  submitOrderConfirm,
  fetchOrderById,
  fetchUserOrders,
  fetchOrderProgress,
  confirmOrderFinish,
  cancelUserOrder,
  ORDER_TYPE,
}
