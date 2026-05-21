/**
 * MOCK: 用户订单/预约 — D6 + D7
 * 联调后由 services/order.js 接真实 API
 */
const { ORDER_STATUS } = require('../constants/order-status')
const { ORDER_TYPE } = require('../constants/order-type')
const { PRICE_MODE } = require('../constants/price-mode')
const { buildBookingDates } = require('../constants/booking-slots')
const { getSession } = require('../utils/auth')
const { resolveOrderType, maskPlate } = require('../utils/order-form')
const { formatYuan } = require('../utils/format')
const { REFUND_STATUS } = require('../utils/order-display')
const {
  buildProgressSteps,
  buildFeeRows,
  resolvePriceMode,
  getStatusHint,
  formatOrderDateTime,
  needsFeeComplianceNotice,
} = require('../utils/order-display')
const { findStore } = require('../services/store')
const { findRawService } = require('../services/service')

const STORAGE_KEY = 'user_orders_v1'
/** 演示订单集版本：递增后会补全缺失的 demo 订单（不覆盖已有同 id 订单） */
const SEED_VERSION = 3
const SEED_VERSION_KEY = 'user_orders_seed_version'

function delay(ms = 320) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadOrders() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || []
  } catch (e) {
    return []
  }
}

function saveOrders(list) {
  wx.setStorageSync(STORAGE_KEY, list)
}

function isStoreBookable(store) {
  if (!store) return false
  return store.status === 'open'
}

function buildDemoOrders() {
  const now = Date.now()
  const iso = (offsetMin) => new Date(now - offsetMin * 60000).toISOString()
  const appt = {
    dateLabel: '明天',
    slot: '09:00-10:00',
    date: 'demo-date',
  }

  return [
    {
      id: 'ord_demo_wait_pay',
      orderType: ORDER_TYPE.STANDARD_ORDER,
      orderTypeLabel: '标准服务订单',
      status: ORDER_STATUS.WAIT_PAY,
      serviceId: 'svc_seed_1',
      serviceName: '小保养套餐',
      storeId: 'store_demo_1',
      storeName: '透明维修示范店（杭州滨江）',
      vehicle: {
        brand: '宝马',
        series: '3 系',
        plate: '浙A12345',
        plateDisplay: '浙A****5',
      },
      appointment: appt,
      contact: { name: '张先生', phone: '13812345678', phoneDisplay: '138****5678' },
      priceSummary: { serviceAmount: 299, discountAmount: 0, payableAmount: 299 },
      priceMode: PRICE_MODE.FIXED,
      serviceAmount: 399,
      serviceMinAmount: null,
      serviceMaxAmount: null,
      reviewStatus: 'not_reviewed',
      refundStatus: REFUND_STATUS.NONE,
      hasAlbum: false,
      createdAt: iso(30),
      updatedAt: iso(30),
    },
    {
      id: 'ord_demo_wait_accept',
      orderType: ORDER_TYPE.STANDARD_ORDER,
      orderTypeLabel: '标准服务订单',
      status: ORDER_STATUS.WAIT_ACCEPT,
      serviceId: 'svc_seed_1',
      serviceName: '小保养套餐',
      storeId: 'store_demo_1',
      storeName: '透明维修示范店（杭州滨江）',
      vehicle: {
        brand: '大众',
        series: '帕萨特',
        plate: '浙A33333',
        plateDisplay: '浙A****3',
        energyType: '燃油',
      },
      appointment: appt,
      contact: { name: '周先生', phone: '13711112222', phoneDisplay: '137****2222' },
      priceSummary: { serviceAmount: 299, discountAmount: 0, payableAmount: 299 },
      priceMode: PRICE_MODE.FIXED,
      serviceAmount: 299,
      serviceMinAmount: null,
      serviceMaxAmount: null,
      paidAt: iso(45),
      reviewStatus: 'not_reviewed',
      refundStatus: REFUND_STATUS.NONE,
      hasAlbum: false,
      createdAt: iso(50),
      updatedAt: iso(45),
    },
    {
      id: 'ord_demo_accepted',
      orderType: ORDER_TYPE.INSPECTION_BOOKING,
      orderTypeLabel: '到店检测预约',
      status: ORDER_STATUS.ACCEPTED,
      serviceId: 'svc_seed_2',
      serviceName: '刹车片更换',
      storeId: 'store_demo_1',
      storeName: '透明维修示范店（杭州滨江）',
      vehicle: {
        brand: '奔驰',
        series: 'C 级',
        plate: '浙A44444',
        plateDisplay: '浙A****4',
        energyType: '燃油',
      },
      appointment: appt,
      contact: { name: '孙女士', phone: '13622223333', phoneDisplay: '136****3333' },
      priceSummary: null,
      priceMode: PRICE_MODE.RANGE,
      serviceAmount: null,
      serviceMinAmount: 680,
      serviceMaxAmount: 1280,
      reviewStatus: 'not_reviewed',
      refundStatus: REFUND_STATUS.NONE,
      hasAlbum: false,
      acceptedAt: iso(90),
      createdAt: iso(120),
      updatedAt: iso(90),
    },
    {
      id: 'ord_demo_arrived',
      orderType: ORDER_TYPE.STANDARD_ORDER,
      orderTypeLabel: '标准服务订单',
      status: ORDER_STATUS.WAIT_SERVICE,
      serviceId: 'svc_seed_1',
      serviceName: '小保养套餐',
      storeId: 'store_demo_1',
      storeName: '透明维修示范店（杭州滨江）',
      vehicle: {
        brand: '日产',
        series: '天籁',
        plate: '浙A77777',
        plateDisplay: '浙A****7',
        energyType: '燃油',
      },
      appointment: appt,
      contact: { name: '吴先生', phone: '13533334444', phoneDisplay: '135****4444' },
      priceSummary: { serviceAmount: 299, discountAmount: 0, payableAmount: 299 },
      priceMode: PRICE_MODE.FIXED,
      serviceAmount: 299,
      paidAt: iso(150),
      reviewStatus: 'not_reviewed',
      refundStatus: REFUND_STATUS.NONE,
      hasAlbum: false,
      acceptedAt: iso(140),
      arrivedAt: iso(100),
      createdAt: iso(180),
      updatedAt: iso(100),
    },
    {
      id: 'ord_demo_in_service',
      orderType: ORDER_TYPE.STANDARD_ORDER,
      orderTypeLabel: '标准服务订单',
      status: ORDER_STATUS.IN_SERVICE,
      serviceId: 'svc_seed_1',
      serviceName: '小保养套餐',
      storeId: 'store_demo_1',
      storeName: '透明维修示范店（杭州滨江）',
      vehicle: {
        brand: '奥迪',
        series: 'A4L',
        plate: '浙A88888',
        plateDisplay: '浙A****8',
      },
      appointment: appt,
      contact: { name: '李女士', phoneDisplay: '139****1234' },
      priceSummary: { serviceAmount: 299, discountAmount: 0, payableAmount: 299 },
      priceMode: PRICE_MODE.FIXED,
      serviceAmount: 399,
      serviceMinAmount: null,
      serviceMaxAmount: null,
      paidAt: iso(180),
      reviewStatus: 'not_reviewed',
      refundStatus: REFUND_STATUS.NONE,
      hasAlbum: true,
      albumEntry: {
        imageCount: 6,
        latestAt: iso(20),
        nodeTitle: '维修过程',
      },
      progressTimes: {
        订单提交: iso(240),
        支付成功: iso(200),
        商家接单: iso(160),
        用户到店: iso(120),
        开始施工: iso(80),
      },
      createdAt: iso(240),
      updatedAt: iso(20),
    },
    {
      id: 'ord_demo_wait_confirm',
      orderType: ORDER_TYPE.STANDARD_ORDER,
      orderTypeLabel: '标准服务订单',
      status: ORDER_STATUS.WAIT_CONFIRM,
      serviceId: 'svc_seed_2',
      serviceName: '刹车片更换',
      storeId: 'store_demo_1',
      storeName: '透明维修示范店（杭州滨江）',
      vehicle: {
        brand: '丰田',
        series: '凯美瑞',
        plate: '浙B66666',
        plateDisplay: '浙B****6',
      },
      appointment: appt,
      contact: { name: '王先生', phoneDisplay: '137****9999' },
      priceSummary: { serviceAmount: null, discountAmount: 0, payableAmount: 200 },
      priceMode: PRICE_MODE.RANGE,
      serviceAmount: null,
      serviceMinAmount: 680,
      serviceMaxAmount: 1280,
      paidAt: iso(3000),
      reviewStatus: 'not_reviewed',
      refundStatus: REFUND_STATUS.NONE,
      hasAlbum: true,
      albumEntry: {
        imageCount: 12,
        latestAt: iso(60),
        nodeTitle: '完工检查',
      },
      progressTimes: {
        订单提交: iso(4000),
        支付成功: iso(3800),
        商家接单: iso(3600),
        用户到店: iso(3400),
        开始施工: iso(3200),
        维修过程: iso(3000),
        门店标记完工: iso(120),
      },
      createdAt: iso(4000),
      updatedAt: iso(60),
    },
    {
      id: 'ord_demo_completed',
      orderType: ORDER_TYPE.INSPECTION_BOOKING,
      orderTypeLabel: '到店检测预约',
      status: ORDER_STATUS.COMPLETED,
      serviceId: 'svc_seed_2',
      serviceName: '刹车片更换',
      storeId: 'store_demo_1',
      storeName: '透明维修示范店（杭州滨江）',
      vehicle: {
        brand: '本田',
        series: '雅阁',
        plate: '',
        plateDisplay: '',
      },
      appointment: appt,
      contact: { name: '赵女士', phoneDisplay: '136****4321' },
      priceSummary: null,
      priceMode: PRICE_MODE.RANGE,
      serviceAmount: null,
      serviceMinAmount: 680,
      serviceMaxAmount: 1280,
      reviewStatus: 'not_reviewed',
      refundStatus: REFUND_STATUS.NONE,
      hasAlbum: false,
      createdAt: iso(8000),
      updatedAt: iso(7000),
      completedAt: iso(7100),
    },
    {
      id: 'ord_demo_completed_album',
      orderType: ORDER_TYPE.STANDARD_ORDER,
      orderTypeLabel: '标准服务订单',
      status: ORDER_STATUS.COMPLETED,
      serviceId: 'svc_seed_2',
      serviceName: '刹车片更换',
      storeId: 'store_demo_1',
      storeName: '透明维修示范店（杭州滨江）',
      vehicle: {
        brand: '宝马',
        series: '3 系',
        plate: '浙A55555',
        plateDisplay: '浙A****5',
      },
      appointment: appt,
      contact: { name: '陈先生', phoneDisplay: '135****8888' },
      priceSummary: { serviceAmount: 980, discountAmount: 0, payableAmount: 980 },
      priceMode: PRICE_MODE.RANGE,
      serviceAmount: null,
      serviceMinAmount: 680,
      serviceMaxAmount: 1280,
      paidAt: iso(9000),
      reviewStatus: 'not_reviewed',
      refundStatus: REFUND_STATUS.NONE,
      hasAlbum: true,
      albumEntry: {
        imageCount: 8,
        latestAt: iso(7200),
        nodeTitle: '完工结果',
      },
      progressTimes: {
        订单提交: iso(9500),
        支付成功: iso(9200),
        商家接单: iso(9000),
        用户到店: iso(8800),
        开始施工: iso(8600),
        维修过程: iso(8400),
        门店标记完工: iso(7300),
        用户确认完工: iso(7200),
      },
      createdAt: iso(9600),
      updatedAt: iso(7200),
      completedAt: iso(7200),
    },
  ]
}

/**
 * 补全缺失的演示订单（不覆盖用户已改动的同 id 订单）
 * 解决：早期 seed 仅空库写入、或用户先下单导致 demo 未注入的问题
 */
function mergeDemoOrders() {
  let demos
  try {
    demos = buildDemoOrders()
  } catch (e) {
    return loadOrders()
  }

  const list = loadOrders()
  const demoIds = new Set(demos.map((d) => d.id))
  const existingIds = new Set(list.map((o) => o.id))
  const missing = demos.filter((d) => !existingIds.has(d.id))
  const version = wx.getStorageSync(SEED_VERSION_KEY) || 0

  if (missing.length === 0 && version >= SEED_VERSION) {
    return list
  }

  const userOrders = list.filter((o) => !demoIds.has(o.id))
  const presentDemos = demos.filter((d) => existingIds.has(d.id))
  const merged = [...missing, ...presentDemos, ...userOrders]
  saveOrders(merged)
  wx.setStorageSync(SEED_VERSION_KEY, SEED_VERSION)
  return merged
}

function seedDemoOrdersIfNeeded() {
  mergeDemoOrders()
}

async function mockFetchOrderConfirm({ serviceId, storeId }) {
  await delay()
  const record = findRawService(serviceId, 'user')
  if (!record || record.status !== 'published') {
    const err = new Error('该服务已下架，请查看其他服务')
    err.code = 404
    throw err
  }

  const sid = storeId || record.storeId
  const store = sid ? findStore(sid) : null
  if (!store) {
    const err = new Error('门店不存在')
    err.code = 404
    throw err
  }
  if (!isStoreBookable(store)) {
    const err = new Error('该门店暂不可预约')
    err.code = 409
    throw err
  }

  const orderType = resolveOrderType(record.priceMode)
  const session = getSession()
  const user = session.user || {}
  const bookingDates = buildBookingDates(7)
  const serviceAmount =
    record.priceMode === PRICE_MODE.FIXED ? Number(record.amount) || 0 : 0

  return {
    service: {
      id: record.id,
      name: record.name,
      categoryName: record.categoryName,
      summary: record.summary,
      priceMode: record.priceMode,
      amount: record.amount,
      minAmount: record.minAmount,
      maxAmount: record.maxAmount,
      bookable: true,
      onlinePaymentEnabled: Boolean(record.onlinePaymentEnabled),
    },
    store: {
      id: store.id,
      name: store.name,
      address: store.address,
      businessHours: store.businessHours || '—',
      phone: store.phone || '',
      bookable: isStoreBookable(store),
    },
    orderType,
    bookingDates,
    defaultContact: {
      name: user.nickname || '',
      phoneDisplay: user.phoneDisplay || '',
      isPhoneBound: Boolean(user.isPhoneBound),
    },
    priceSummary:
      orderType === ORDER_TYPE.STANDARD_ORDER
        ? {
            serviceAmount,
            discountAmount: 0,
            payableAmount: serviceAmount,
          }
        : null,
    storeInfoRows: [
      { label: '门店名称', value: store.name },
      { label: '地址', value: store.address },
      { label: '营业时间', value: store.businessHours || '—' },
    ],
    priceInfoRows:
      orderType === ORDER_TYPE.STANDARD_ORDER && serviceAmount
        ? [
            { label: '服务金额', value: `¥${formatYuan(serviceAmount)}` },
            { label: '应付金额', value: `¥${formatYuan(serviceAmount)}` },
          ]
        : [],
  }
}

function buildOrderRecord(payload, orderType) {
  const id = `ord_${Date.now()}`
  const now = new Date().toISOString()
  const isBooking = orderType !== ORDER_TYPE.STANDARD_ORDER
  const serviceRaw = payload.serviceId
    ? findRawService(payload.serviceId, 'user')
    : null
  return {
    id,
    orderType,
    orderTypeLabel:
      orderType === ORDER_TYPE.STANDARD_ORDER
        ? '标准服务订单'
        : orderType === ORDER_TYPE.ACCIDENT_BOOKING
          ? '事故车检测预约'
          : '到店检测预约',
    status: isBooking ? ORDER_STATUS.WAIT_ACCEPT : ORDER_STATUS.WAIT_PAY,
    serviceId: payload.serviceId,
    serviceName: payload.serviceName,
    storeId: payload.storeId,
    storeName: payload.storeName,
    vehicle: {
      ...payload.vehicle,
      plateDisplay: maskPlate(payload.vehicle.plate),
    },
    appointment: payload.appointment,
    contact: payload.contact,
    priceSummary: payload.priceSummary || null,
    priceMode: serviceRaw ? serviceRaw.priceMode : null,
    serviceAmount: serviceRaw ? serviceRaw.amount : null,
    serviceMinAmount: serviceRaw ? serviceRaw.minAmount : null,
    serviceMaxAmount: serviceRaw ? serviceRaw.maxAmount : null,
    reviewStatus: 'not_reviewed',
    refundStatus: REFUND_STATUS.NONE,
    hasAlbum: false,
    createdAt: now,
    updatedAt: now,
  }
}

async function mockCreateOrder(payload) {
  await delay(400)
  const order = buildOrderRecord(payload, ORDER_TYPE.STANDARD_ORDER)
  const list = loadOrders()
  list.unshift(order)
  saveOrders(list)
  return order
}

async function mockCreateBooking(payload, orderType) {
  await delay(400)
  const order = buildOrderRecord(payload, orderType)
  const list = loadOrders()
  list.unshift(order)
  saveOrders(list)
  return order
}

async function mockPayOrder(orderId) {
  await delay(500)
  const list = loadOrders()
  const idx = list.findIndex((o) => o.id === orderId)
  if (idx < 0) {
    const err = new Error('订单不存在')
    err.code = 404
    throw err
  }
  const order = list[idx]
  if (order.status !== ORDER_STATUS.WAIT_PAY) {
    const err = new Error('订单状态已变更，请刷新后重试')
    err.code = 409
    throw err
  }
  order.status = ORDER_STATUS.WAIT_ACCEPT
  order.updatedAt = new Date().toISOString()
  order.paidAt = order.updatedAt
  list[idx] = order
  saveOrders(list)
  return order
}

function mockGetOrder(orderId) {
  seedDemoOrdersIfNeeded()
  return loadOrders().find((o) => o.id === orderId) || null
}

function updateOrderInStorage(orderId, patch) {
  const list = loadOrders()
  const idx = list.findIndex((o) => o.id === orderId)
  if (idx < 0) return null
  const next = {
    ...list[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  list[idx] = next
  saveOrders(list)
  return next
}

function buildOrderDetail(order) {
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
        priceMode: resolvePriceMode(order, null),
      }

  const storeOffShelf = store ? store.status !== 'open' : false
  const vehicle = order.vehicle || {}
  const contact = order.contact || {}

  return {
    ...order,
    statusHint: getStatusHint({
      ...order,
      storeOffShelf,
    }),
    progressSteps: buildProgressSteps(order),
    service,
    store: store
      ? {
          id: store.id,
          name: store.name,
          address: store.address,
          phone: store.phone || '',
          businessHours: store.businessHours || '—',
          latitude: store.latitude,
          longitude: store.longitude,
        }
      : {
          name: order.storeName,
          address: '—',
          phone: '',
          businessHours: '—',
        },
    storeOffShelf,
    serviceRows: [
      { label: '服务名称', value: order.serviceName },
      { label: '服务分类', value: service.categoryName || '—' },
      { label: '订单类型', value: order.orderTypeLabel || '—' },
    ],
    storeRows: [
      { label: '门店名称', value: (store && store.name) || order.storeName },
      { label: '地址', value: (store && store.address) || '—' },
      { label: '营业时间', value: (store && store.businessHours) || '—' },
      {
        label: '联系电话',
        value: (store && store.phone) || '门店暂未提供',
      },
    ],
    vehicleRows: [
      { label: '车辆品牌', value: vehicle.brand || '—' },
      { label: '车型', value: vehicle.series || '—' },
      { label: '车牌', value: vehicle.plateDisplay || '未填写' },
    ],
    appointmentRows: [
      {
        label: '预约时间',
        value: order.appointment
          ? `${order.appointment.dateLabel || ''} ${order.appointment.slot || ''}`.trim() || '—'
          : '—',
      },
      { label: '联系人', value: contact.name || '—' },
      { label: '手机号', value: contact.phoneDisplay || '—' },
    ],
    feeRows: buildFeeRows(order, service),
    priceMode: resolvePriceMode(order, service),
    showFeeCompliance: needsFeeComplianceNotice(resolvePriceMode(order, service)),
    metaRows: [
      { label: '订单编号', value: order.id },
      {
        label: '下单时间',
        value: formatOrderDateTime(order.createdAt),
      },
    ],
    flags: {
      isAccident: order.orderType === ORDER_TYPE.ACCIDENT_BOOKING,
      storeOffShelf,
      canConfirmFinish: order.status === ORDER_STATUS.WAIT_CONFIRM,
      canReview:
        order.status === ORDER_STATUS.COMPLETED &&
        order.reviewStatus === 'not_reviewed',
      canAfterSale:
        order.status === ORDER_STATUS.WAIT_CONFIRM ||
        order.status === ORDER_STATUS.COMPLETED,
    },
  }
}

async function mockGetOrderDetail(orderId) {
  await delay(200)
  const order = mockGetOrder(orderId)
  if (!order) {
    const err = new Error('订单不存在或已被删除。')
    err.code = 404
    throw err
  }
  return buildOrderDetail(order)
}

async function mockFetchOrderProgress(orderId) {
  await delay(150)
  const order = mockGetOrder(orderId)
  if (!order) {
    const err = new Error('订单不存在')
    err.code = 404
    throw err
  }
  return { steps: buildProgressSteps(order) }
}

async function mockConfirmOrderFinish(orderId) {
  await delay(400)
  const order = mockGetOrder(orderId)
  if (!order) {
    const err = new Error('订单不存在')
    err.code = 404
    throw err
  }
  if (order.status !== ORDER_STATUS.WAIT_CONFIRM) {
    const err = new Error('订单状态已变更，请刷新后重试')
    err.code = 409
    throw err
  }
  const now = new Date().toISOString()
  const updated = updateOrderInStorage(orderId, {
    status: ORDER_STATUS.COMPLETED,
    completedAt: now,
    reviewStatus: 'not_reviewed',
    progressTimes: {
      ...(order.progressTimes || {}),
      用户确认完工: now,
    },
  })
  return buildOrderDetail(updated)
}

async function mockCancelOrder(orderId) {
  await delay(300)
  const order = mockGetOrder(orderId)
  if (!order) {
    const err = new Error('订单不存在')
    err.code = 404
    throw err
  }
  if (
    order.status !== ORDER_STATUS.WAIT_PAY &&
    order.status !== ORDER_STATUS.WAIT_ACCEPT
  ) {
    const err = new Error('当前状态不可取消')
    err.code = 409
    throw err
  }
  const patch = {
    status: ORDER_STATUS.CANCELLED,
  }
  if (order.paidAt) {
    patch.refundStatus = REFUND_STATUS.REFUNDING
  }
  const updated = updateOrderInStorage(orderId, patch)
  return buildOrderDetail(updated)
}

function loadOrdersWithSeed() {
  seedDemoOrdersIfNeeded()
  return loadOrders()
}

module.exports = {
  mockFetchOrderConfirm,
  mockCreateOrder,
  mockCreateBooking,
  mockPayOrder,
  mockGetOrder,
  mockGetOrderDetail,
  mockFetchOrderProgress,
  mockConfirmOrderFinish,
  mockCancelOrder,
  loadOrders: loadOrdersWithSeed,
  updateOrderInStorage,
  buildOrderDetail,
}
