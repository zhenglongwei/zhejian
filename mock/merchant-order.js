/**
 * MOCK: 商家订单履约 — D9
 * 联调后由 services/merchant-order.js 接 /api/merchant/orders/*
 */
const { ORDER_STATUS } = require('../constants/order-status')
const { ORDER_TYPE } = require('../constants/order-type')
const { ORDER_REJECT_REASONS } = require('../constants/order-reject-reasons')
const { isBookingOrderType } = require('../utils/order-form')
const { REFUND_STATUS } = require('../utils/order-display')
const { buildMerchantOrderDetail } = require('../utils/merchant-order-display')
const { findStore } = require('../services/store')
const { findRawService } = require('../services/service')
const {
  loadOrders,
  mockGetOrder,
  updateOrderInStorage,
} = require('./orders')
const { ensureMerchantOrderAlbumDraft } = require('./order-album')

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms))
}

function appendFulfillmentLog(order, entry) {
  const log = {
    id: `log_${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...entry,
  }
  return [...(order.fulfillmentLog || []), log]
}

function filterByStore(orders, storeId) {
  if (!storeId) return orders || []
  return (orders || []).filter((o) => o.storeId === storeId)
}

function assertMerchantOrder(order, storeId) {
  if (!order) {
    const err = new Error('订单不存在或已被删除。')
    err.code = 404
    throw err
  }
  if (storeId && order.storeId !== storeId) {
    const err = new Error('你无权操作该订单。')
    err.code = 403
    throw err
  }
}

function buildDetail(order) {
  const store = order.storeId ? findStore(order.storeId) : null
  const serviceRaw = order.serviceId ? findRawService(order.serviceId, 'user') : null
  const service = serviceRaw
    ? {
        id: serviceRaw.id,
        name: serviceRaw.name,
        categoryName: serviceRaw.categoryName,
        summary: serviceRaw.summary,
        priceMode: serviceRaw.priceMode,
        amount: serviceRaw.amount,
        minAmount: serviceRaw.minAmount,
        maxAmount: serviceRaw.maxAmount,
      }
    : {
        name: order.serviceName,
        categoryName: '—',
        priceMode: order.priceMode,
      }
  return buildMerchantOrderDetail(order, store, service)
}

async function mockFetchMerchantOrders({ tab, storeId } = {}) {
  await delay(200)
  const { filterMerchantOrdersByTab } = require('../utils/merchant-order-display')
  let list = filterByStore(loadOrders(), storeId)
  if (tab) {
    list = filterMerchantOrdersByTab(list, tab)
  }
  return list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}

async function mockFetchMerchantOrderDetail(orderId, storeId) {
  await delay(180)
  const order = mockGetOrder(orderId)
  assertMerchantOrder(order, storeId)
  return buildDetail(order)
}

async function mockAcceptOrder(orderId, storeId) {
  await delay(350)
  const order = mockGetOrder(orderId)
  assertMerchantOrder(order, storeId)
  if (order.status !== ORDER_STATUS.WAIT_ACCEPT) {
    const err = new Error('订单状态已变更，请刷新后重试')
    err.code = 409
    throw err
  }
  const now = new Date().toISOString()
  const updated = updateOrderInStorage(orderId, {
    status: ORDER_STATUS.ACCEPTED,
    acceptedAt: now,
    fulfillmentLog: appendFulfillmentLog(order, {
      action: 'accept',
      actionLabel: '商家接单',
      fromStatus: order.status,
      toStatus: ORDER_STATUS.ACCEPTED,
    }),
    progressTimes: {
      ...(order.progressTimes || {}),
      商家接单: now,
      门店确认: isBookingOrderType(order.orderType) ? now : order.progressTimes && order.progressTimes['门店确认'],
    },
  })
  return buildDetail(updated)
}

async function mockRejectOrder(orderId, storeId, { reasonKey, reasonLabel, remark }) {
  await delay(400)
  const order = mockGetOrder(orderId)
  assertMerchantOrder(order, storeId)
  if (order.status !== ORDER_STATUS.WAIT_ACCEPT) {
    const err = new Error('订单状态已变更，请刷新后重试')
    err.code = 409
    throw err
  }
  const label =
    reasonLabel ||
    (ORDER_REJECT_REASONS.find((r) => r.key === reasonKey) || {}).label ||
    '其他原因'
  const patch = {
    status: ORDER_STATUS.CLOSED,
    rejectReasonKey: reasonKey,
    rejectReasonLabel: label,
    fulfillmentLog: appendFulfillmentLog(order, {
      action: 'reject',
      actionLabel: '商家拒单',
      reason: label,
      remark: remark || '',
      fromStatus: order.status,
      toStatus: ORDER_STATUS.CLOSED,
    }),
  }
  if (order.paidAt || (order.priceSummary && order.priceSummary.payableAmount > 0)) {
    patch.refundStatus = REFUND_STATUS.REFUNDING
  }
  const updated = updateOrderInStorage(orderId, patch)
  return buildDetail(updated)
}

async function mockRescheduleOrder(orderId, storeId, { dateLabel, slot, date, reason }) {
  await delay(320)
  const order = mockGetOrder(orderId)
  assertMerchantOrder(order, storeId)
  if (
    order.status !== ORDER_STATUS.ACCEPTED &&
    order.status !== ORDER_STATUS.WAIT_SERVICE
  ) {
    const err = new Error('当前状态不可修改预约')
    err.code = 409
    throw err
  }
  const updated = updateOrderInStorage(orderId, {
    appointment: {
      ...(order.appointment || {}),
      dateLabel: dateLabel || order.appointment.dateLabel,
      slot: slot || order.appointment.slot,
      date: date || order.appointment.date,
    },
    fulfillmentLog: appendFulfillmentLog(order, {
      action: 'reschedule',
      actionLabel: '修改预约时间',
      remark: reason || '',
      fromStatus: order.status,
      toStatus: order.status,
    }),
  })
  return buildDetail(updated)
}

async function mockMarkOrderArrived(orderId, storeId) {
  await delay(300)
  const order = mockGetOrder(orderId)
  assertMerchantOrder(order, storeId)
  if (order.status !== ORDER_STATUS.ACCEPTED) {
    const err = new Error('请先确认订单处于待到店状态')
    err.code = 409
    throw err
  }
  const now = new Date().toISOString()
  const updated = updateOrderInStorage(orderId, {
    status: ORDER_STATUS.WAIT_SERVICE,
    arrivedAt: now,
    fulfillmentLog: appendFulfillmentLog(order, {
      action: 'arrive',
      actionLabel: '标记到店',
      fromStatus: order.status,
      toStatus: ORDER_STATUS.WAIT_SERVICE,
    }),
    progressTimes: {
      ...(order.progressTimes || {}),
      用户到店: now,
    },
  })
  return buildDetail(updated)
}

async function mockStartOrderRepair(orderId, storeId) {
  await delay(320)
  const order = mockGetOrder(orderId)
  assertMerchantOrder(order, storeId)
  if (
    order.status !== ORDER_STATUS.ACCEPTED &&
    order.status !== ORDER_STATUS.WAIT_SERVICE
  ) {
    const err = new Error('当前状态不可开始维修')
    err.code = 409
    throw err
  }
  const now = new Date().toISOString()
  const patch = {
    status: ORDER_STATUS.IN_SERVICE,
    repairStartedAt: now,
    hasAlbum: true,
    fulfillmentLog: appendFulfillmentLog(order, {
      action: 'start_repair',
      actionLabel: '开始维修',
      fromStatus: order.status,
      toStatus: ORDER_STATUS.IN_SERVICE,
    }),
    progressTimes: {
      ...(order.progressTimes || {}),
      开始施工: now,
      用户到店: order.progressTimes && order.progressTimes['用户到店'] ? order.progressTimes['用户到店'] : now,
    },
  }
  if (!order.arrivedAt && order.status === ORDER_STATUS.ACCEPTED) {
    patch.arrivedAt = now
  }
  const updated = updateOrderInStorage(orderId, patch)
  ensureMerchantOrderAlbumDraft(updated)
  return buildDetail(updated)
}

async function mockSubmitOrderComplete(orderId, storeId, payload = {}) {
  await delay(420)
  const order = mockGetOrder(orderId)
  assertMerchantOrder(order, storeId)
  if (order.status !== ORDER_STATUS.IN_SERVICE) {
    const err = new Error('当前状态不可提交完工')
    err.code = 409
    throw err
  }
  const now = new Date().toISOString()
  const updated = updateOrderInStorage(orderId, {
    status: ORDER_STATUS.WAIT_CONFIRM,
    repairFinishedAt: now,
    fulfillment: {
      repairSummary: payload.repairSummary || '',
      partsSummary: payload.partsSummary || '',
      priceNote: payload.priceNote || '',
      warrantyNote: payload.warrantyNote || '',
      generateCaseDraft: Boolean(payload.generateCaseDraft),
    },
    fulfillmentLog: appendFulfillmentLog(order, {
      action: 'complete',
      actionLabel: '提交完工',
      remark: payload.repairSummary || '',
      fromStatus: order.status,
      toStatus: ORDER_STATUS.WAIT_CONFIRM,
    }),
    progressTimes: {
      ...(order.progressTimes || {}),
      门店标记完工: now,
    },
  })
  return buildDetail(updated)
}

async function mockFetchMerchantOrderStats(storeId) {
  await delay(120)
  const { countMerchantTodos } = require('../utils/merchant-order-display')
  const list = filterByStore(loadOrders(), storeId)
  return countMerchantTodos(list)
}

module.exports = {
  mockFetchMerchantOrders,
  mockFetchMerchantOrderDetail,
  mockAcceptOrder,
  mockRejectOrder,
  mockRescheduleOrder,
  mockMarkOrderArrived,
  mockStartOrderRepair,
  mockSubmitOrderComplete,
  mockFetchMerchantOrderStats,
}
