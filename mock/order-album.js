/**
 * MOCK: 用户订单服务相册 — D8
 * 联调后由 services/order-album.js 接 GET /api/user/orders/{order_id}/album
 */
const { ORDER_STATUS } = require('../constants/order-status')
const { ALBUM_TEMPLATES } = require('../constants/album')
const {
  buildOrderAlbumViewModel,
  buildOrderAlbumNodes,
  resolveOrderAlbumTemplateForOrder,
  resolveTemplateForAlbum,
  applyTemplateSwitch,
  normalizeOrderAlbumNodesForStorage,
  TEMPLATE_SOURCE,
} = require('../services/order-album-template')
const { isLoggedIn } = require('../utils/auth')
const { formatOrderDateTime, REFUND_STATUS } = require('../utils/order-display')
const { findStore } = require('../services/store')
const { mockGetOrder } = require('./orders')
const {
  ensureOrderPreMaskTask,
  shouldRunOrderPreMask,
} = require('../services/desensitize')

const AUTH_STORAGE_KEY = 'order_album_auth_v1'
const MERCHANT_ALBUM_STORAGE_KEY = 'merchant_order_albums_v1'

function loadMerchantAlbumMap() {
  try {
    return wx.getStorageSync(MERCHANT_ALBUM_STORAGE_KEY) || {}
  } catch (e) {
    return {}
  }
}

function saveMerchantAlbumMap(map) {
  wx.setStorageSync(MERCHANT_ALBUM_STORAGE_KEY, map)
}

function buildEmptyAlbumNodes(order) {
  const resolved = resolveOrderAlbumTemplateForOrder(order)
  return buildOrderAlbumNodes(resolved.template, [])
}

function countAlbumImages(nodes) {
  return (nodes || []).reduce((sum, n) => sum + ((n.images && n.images.length) || 0), 0)
}

function syncOrderAlbumMeta(orderId, nodes) {
  const { mockGetOrder, updateOrderInStorage } = require('./orders')
  const order = mockGetOrder(orderId)
  if (!order) return
  const imageCount = countAlbumImages(nodes)
  const latestNode = (nodes || []).find((n) => (n.images || []).length > 0)
  updateOrderInStorage(orderId, {
    hasAlbum: true,
    albumEntry: {
      imageCount,
      latestAt: new Date().toISOString(),
      nodeTitle: (latestNode && latestNode.title) || '维修过程',
    },
  })
}

function ensureMerchantOrderAlbumDraft(order) {
  if (!order || !order.id) return null
  const map = loadMerchantAlbumMap()
  if (map[order.id]) {
    const stored = map[order.id]
    const view = buildOrderAlbumViewModel(order, stored)
    map[order.id] = {
      ...stored,
      templateId: view.templateId,
      templateName: view.templateName,
      templateSource: stored.templateSource || TEMPLATE_SOURCE.AUTO,
      nodes: normalizeOrderAlbumNodesForStorage(view.nodes),
    }
    saveMerchantAlbumMap(map)
    syncOrderAlbumMeta(order.id, map[order.id].nodes)
    return map[order.id]
  }
  const resolved = resolveOrderAlbumTemplateForOrder(order)
  const album = {
    albumId: `alb_${order.id}`,
    albumStatus: 'draft',
    templateId: resolved.templateId,
    templateName: resolved.templateName,
    templateSource: TEMPLATE_SOURCE.AUTO,
    imageCount: 0,
    storeNote: '',
    nodes: buildEmptyAlbumNodes(order),
  }
  map[order.id] = album
  saveMerchantAlbumMap(map)
  syncOrderAlbumMeta(order.id, album.nodes)
  return album
}

function getMerchantStoredAlbum(orderId) {
  return loadMerchantAlbumMap()[orderId] || null
}

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms))
}

function mockImageUrl(orderId, nodeId, index) {
  return `mock://order-album/${orderId}/${nodeId}/${index}`
}

function loadAuthMap() {
  try {
    return wx.getStorageSync(AUTH_STORAGE_KEY) || {}
  } catch (e) {
    return {}
  }
}

function saveAuthMap(map) {
  wx.setStorageSync(AUTH_STORAGE_KEY, map)
}

function buildVehicleDisplay(vehicle) {
  if (!vehicle) return '—'
  const brand = vehicle.brand || ''
  const series = vehicle.series || ''
  const plate = vehicle.plateDisplay || ''
  const model = [brand, series].filter(Boolean).join(' ')
  if (model && plate) return `${model} / ${plate}`
  return model || plate || '—'
}

function buildStoreBlock(order) {
  const store = order.storeId ? findStore(order.storeId) : null
  return {
    id: (store && store.id) || order.storeId || '',
    name: (store && store.name) || order.storeName || '—',
    phone: (store && store.phone) || '',
    address: (store && store.address) || '—',
  }
}

/** 小保养 · 服务中：6 张，部分节点有图 */
function buildInServiceAlbum(order) {
  const orderId = order.id
  const nodes = [
    {
      id: 'arrival',
      title: '到店接车',
      status: 'completed',
      images: [mockImageUrl(orderId, 'arrival', 0), mockImageUrl(orderId, 'arrival', 1)],
      note: '车辆已登记，开始常规保养流程。',
      updatedAt: order.progressTimes && order.progressTimes['用户到店'],
    },
    {
      id: 'before',
      title: '施工前',
      status: 'completed',
      images: [mockImageUrl(orderId, 'before', 0)],
      note: '机油液位正常，机滤建议更换。',
      updatedAt: order.progressTimes && order.progressTimes['开始施工'],
    },
    {
      id: 'process',
      title: '施工中',
      status: 'active',
      images: [
        mockImageUrl(orderId, 'process', 0),
        mockImageUrl(orderId, 'process', 1),
        mockImageUrl(orderId, 'process', 2),
      ],
      note: '正在更换机油机滤并检查灯光胎压。',
      updatedAt: order.updatedAt,
    },
    {
      id: 'check',
      title: '完工检查',
      status: 'pending',
      images: [],
      note: '',
      updatedAt: '',
    },
    {
      id: 'handover',
      title: '交车确认',
      status: 'pending',
      images: [],
      note: '',
      updatedAt: '',
    },
  ]
  return {
    albumId: `alb_${orderId}`,
    albumStatus: 'uploaded',
    imageCount: 6,
    storeNote: '',
    nodes,
  }
}

/** 刹车片 · 待确认完工：12 张，含完工节点 */
function buildWaitConfirmAlbum(order) {
  const orderId = order.id
  const template = ALBUM_TEMPLATES.brake
  const nodeDefs = [
    { id: 'before', count: 2, status: 'completed', note: '制动异响，待拆检确认。' },
    { id: 'fault', count: 3, status: 'completed', note: '前刹车片磨损接近极限。' },
    { id: 'parts', count: 3, status: 'completed', note: '已更换前刹车片与刹车盘。' },
    { id: 'process', count: 3, status: 'completed', note: '安装后已进行路试检查。' },
    { id: 'done', count: 1, status: 'completed', note: '完工检查通过，待用户确认。' },
  ]
  const titleMap = {}
  template.nodes.forEach((n) => {
    titleMap[n.id] = n.title
  })
  const nodes = nodeDefs.map((def) => ({
    id: def.id,
    title: titleMap[def.id] || def.id,
    status: def.status,
    images: Array.from({ length: def.count }, (_, i) =>
      mockImageUrl(orderId, def.id, i)
    ),
    note: def.note,
    updatedAt: def.id === 'done' ? order.updatedAt : order.progressTimes && order.progressTimes['维修过程'],
  }))
  return {
    albumId: `alb_${orderId}`,
    albumStatus: 'completed',
    imageCount: 12,
    storeNote:
      '左前制动片磨损严重，已更换新件并完成试车。如有疑问可联系门店或客服。',
    nodes,
  }
}

/** 已完成 · 授权演示：8 张 */
function buildCompletedAlbum(order) {
  const orderId = order.id
  const nodes = [
    {
      id: 'before',
      title: '维修前状态',
      status: 'completed',
      images: [mockImageUrl(orderId, 'before', 0), mockImageUrl(orderId, 'before', 1)],
      note: '制动异响，到店检测。',
      updatedAt: order.completedAt,
    },
    {
      id: 'fault',
      title: '故障点',
      status: 'completed',
      images: [mockImageUrl(orderId, 'fault', 0), mockImageUrl(orderId, 'fault', 1)],
      note: '前刹车片厚度不足。',
      updatedAt: order.completedAt,
    },
    {
      id: 'parts',
      title: '新旧配件对比',
      status: 'completed',
      images: [mockImageUrl(orderId, 'parts', 0), mockImageUrl(orderId, 'parts', 1)],
      note: '已更换前刹车片。',
      updatedAt: order.completedAt,
    },
    {
      id: 'done',
      title: '完工结果',
      status: 'completed',
      images: [mockImageUrl(orderId, 'done', 0), mockImageUrl(orderId, 'done', 1)],
      note: '试车正常，制动效果良好。',
      updatedAt: order.completedAt,
    },
  ]
  return {
    albumId: `alb_${orderId}`,
    albumStatus: 'report_generated',
    imageCount: 8,
    storeNote: '本次维修已完成，档案仅你可见。如需公开为案例，可在下方授权。',
    nodes,
  }
}

function resolveAlbumPayload(order) {
  if (!order) return null
  const stored = getMerchantStoredAlbum(order.id)
  if (stored) return stored
  if (!order.hasAlbum) return null
  switch (order.id) {
    case 'ord_demo_in_service':
      return buildInServiceAlbum(order)
    case 'ord_demo_wait_confirm':
      return buildWaitConfirmAlbum(order)
    case 'ord_demo_completed_album':
      return buildCompletedAlbum(order)
    default:
      return {
        albumId: `alb_${order.id}`,
        albumStatus: 'empty',
        imageCount: order.albumEntry ? order.albumEntry.imageCount || 0 : 0,
        storeNote: '',
        nodes: (ALBUM_TEMPLATES.brake.nodes || []).map((n) => ({
          id: n.id,
          title: n.title,
          status: 'pending',
          images: [],
          note: '',
          updatedAt: '',
        })),
      }
  }
}

function mapNodesForView(nodes) {
  return (nodes || []).map((node) => ({
    ...node,
    updatedAtText: node.updatedAt ? formatOrderDateTime(node.updatedAt) : '',
  }))
}

function buildSummaryRows(order, album) {
  return [
    { label: '服务项目', value: order.serviceName || '—' },
    { label: '门店', value: order.storeName || '—' },
    { label: '车辆', value: buildVehicleDisplay(order.vehicle) },
    { label: '图片总数', value: `${album.imageCount || 0} 张` },
  ]
}

function resolvePublicCaseStatus(albumId) {
  const { resolvePublicCaseUiStatus } = require('../services/public-case')
  return resolvePublicCaseUiStatus(albumId)
}

async function mockFetchOrderAlbum(orderId) {
  await delay()
  if (!isLoggedIn()) {
    const err = new Error('请先登录')
    err.code = 401
    throw err
  }
  const order = mockGetOrder(orderId)
  if (!order) {
    const err = new Error('订单不存在或已被删除。')
    err.code = 404
    throw err
  }
  const stored = getMerchantStoredAlbum(orderId)
  if (!order.hasAlbum && !stored) {
    const err = new Error('该订单暂无服务相册。')
    err.code = 404
    throw err
  }

  const album = resolveAlbumPayload(order)
  if (!album) {
    const err = new Error('该订单暂无服务相册。')
    err.code = 404
    throw err
  }

  const publicCaseStatus = resolvePublicCaseStatus(album.albumId)
  const nodes = mapNodesForView(album.nodes)

  if (shouldRunOrderPreMask(album.albumStatus) && nodes.some((n) => (n.images || []).length)) {
    await ensureOrderPreMaskTask(album.albumId, album.nodes)
  }

  return {
    albumId: album.albumId,
    orderId: order.id,
    serviceName: order.serviceName,
    store: buildStoreBlock(order),
    orderStatus: order.status,
    vehicleDisplay: buildVehicleDisplay(order.vehicle),
    imageCount: album.imageCount,
    albumStatus: album.albumStatus,
    publicCaseStatus,
    aftersaleBlocked: order.refundStatus === REFUND_STATUS.REFUNDING,
    storeNote: album.storeNote || '',
    nodes,
    summaryRows: buildSummaryRows(order, album),
  }
}

async function mockSubmitAlbumAuthorization(albumId, payload = {}) {
  await delay(400)
  if (!isLoggedIn()) {
    const err = new Error('请先登录')
    err.code = 401
    throw err
  }
  const map = loadAuthMap()
  if (payload.agreed === false) {
    map[albumId] = 'rejected'
    saveAuthMap(map)
    return { publicCaseStatus: 'user_rejected' }
  }
  map[albumId] = 'authorized'
  saveAuthMap(map)
  return { publicCaseStatus: 'authorized' }
}

async function mockFetchMerchantOrderAlbum(orderId) {
  await delay()
  const order = mockGetOrder(orderId)
  if (!order) {
    const err = new Error('订单不存在或已被删除。')
    err.code = 404
    throw err
  }
  if (order.status === ORDER_STATUS.WAIT_ACCEPT) {
    const err = new Error('请先接单后再上传服务相册。')
    err.code = 409
    throw err
  }

  let stored = getMerchantStoredAlbum(orderId)
  if (!stored) {
    stored = ensureMerchantOrderAlbumDraft(order)
  } else {
    const view = buildOrderAlbumViewModel(order, stored)
    stored = {
      ...stored,
      templateId: view.templateId,
      templateName: view.templateName,
      templateSource: stored.templateSource || TEMPLATE_SOURCE.AUTO,
      nodes: normalizeOrderAlbumNodesForStorage(view.nodes),
    }
    const map = loadMerchantAlbumMap()
    map[orderId] = stored
    saveMerchantAlbumMap(map)
  }

  const view = buildOrderAlbumViewModel(order, stored)
  const nodes = mapNodesForView(view.nodes)
  return {
    albumId: stored.albumId,
    orderId: order.id,
    serviceName: order.serviceName,
    orderStatus: order.status,
    vehicleDisplay: buildVehicleDisplay(order.vehicle),
    imageCount: countAlbumImages(view.nodes),
    albumStatus: stored.albumStatus || 'draft',
    templateId: view.templateId,
    templateName: view.templateName,
    matchSource: view.matchSource,
    templateSource: view.templateSource,
    completeness: view.completeness,
    storeNote: stored.storeNote || '',
    nodes,
    summaryRows: buildSummaryRows(order, {
      ...stored,
      imageCount: countAlbumImages(view.nodes),
    }),
  }
}

async function mockSaveMerchantOrderAlbum(orderId, payload = {}) {
  await delay(320)
  const order = mockGetOrder(orderId)
  if (!order) {
    const err = new Error('订单不存在或已被删除。')
    err.code = 404
    throw err
  }
  const map = loadMerchantAlbumMap()
  const prev = map[orderId] || ensureMerchantOrderAlbumDraft(order)
  const templateSource =
    payload.templateSource != null ? payload.templateSource : prev.templateSource || TEMPLATE_SOURCE.AUTO
  const resolved = resolveTemplateForAlbum(order, {
    ...prev,
    templateSource,
    templateId: payload.templateId != null ? payload.templateId : prev.templateId,
  })
  const nodes = buildOrderAlbumNodes(
    resolved.template,
    payload.nodes || prev.nodes || []
  )
  const album = {
    ...prev,
    templateId: resolved.templateId,
    templateName: resolved.templateName,
    templateSource,
    nodes,
    storeNote: payload.storeNote != null ? payload.storeNote : prev.storeNote,
    imageCount: countAlbumImages(nodes),
    albumStatus: countAlbumImages(nodes) > 0 ? 'uploaded' : 'draft',
  }
  map[orderId] = album
  saveMerchantAlbumMap(map)
  syncOrderAlbumMeta(orderId, nodes)
  return mockFetchMerchantOrderAlbum(orderId)
}

async function mockSwitchMerchantOrderAlbumTemplate(orderId, templateId) {
  await delay(280)
  const order = mockGetOrder(orderId)
  if (!order) {
    const err = new Error('订单不存在或已被删除。')
    err.code = 404
    throw err
  }
  const map = loadMerchantAlbumMap()
  const prev = map[orderId] || ensureMerchantOrderAlbumDraft(order)
  const switched = applyTemplateSwitch(templateId, prev.nodes)
  const album = {
    ...prev,
    templateId: switched.templateId,
    templateName: switched.templateName,
    templateSource: TEMPLATE_SOURCE.MANUAL,
    nodes: normalizeOrderAlbumNodesForStorage(switched.nodes),
    imageCount: countAlbumImages(switched.nodes),
    albumStatus: countAlbumImages(switched.nodes) > 0 ? 'uploaded' : prev.albumStatus,
  }
  map[orderId] = album
  saveMerchantAlbumMap(map)
  syncOrderAlbumMeta(orderId, album.nodes)
  return mockFetchMerchantOrderAlbum(orderId)
}

module.exports = {
  mockFetchOrderAlbum,
  mockSubmitAlbumAuthorization,
  mockFetchMerchantOrderAlbum,
  mockSaveMerchantOrderAlbum,
  mockSwitchMerchantOrderAlbumTemplate,
  ensureMerchantOrderAlbumDraft,
  getMerchantStoredAlbum,
}
