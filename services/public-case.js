/**
 * 订单授权 → 公开案例发布（相册 V3 · MOCK）
 * 联调后接平台审核与 H5 索引 API
 */
const { CASE_SOURCE } = require('../constants/case-source')
const { PUBLIC_CASE_STATUS } = require('../constants/public-case-status')
const { PRICE_MODE } = require('../constants/price-mode')
const { mockGetOrder } = require('../mock/orders')
const { publishCaseFromOrderAlbum } = require('./case')
const { fetchTask } = require('./desensitize')
const {
  mockDesensitizedUrl,
  pickDesensitizedCover,
} = require('../utils/desensitize-mock')
const { buildCaseFaq } = require('../utils/case-faq')

const STORAGE_META = 'public_case_meta_v1'

function delay(ms = 320) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadMetaMap() {
  try {
    return wx.getStorageSync(STORAGE_META) || {}
  } catch (e) {
    return {}
  }
}

function saveMetaMap(map) {
  wx.setStorageSync(STORAGE_META, map)
}

function setPublicCaseMeta(albumId, patch) {
  const map = loadMetaMap()
  map[albumId] = {
    ...(map[albumId] || {}),
    ...patch,
    albumId,
    updatedAt: new Date().toISOString(),
  }
  saveMetaMap(map)
  return map[albumId]
}

function getPublicCaseMeta(albumId) {
  return loadMetaMap()[albumId] || null
}

function resolvePublicCaseUiStatus(albumId) {
  const meta = getPublicCaseMeta(albumId)
  if (meta && meta.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
    return 'public_approved'
  }
  if (meta && meta.status === PUBLIC_CASE_STATUS.PENDING_REVIEW) {
    return 'pending_review'
  }
  if (meta && meta.status === PUBLIC_CASE_STATUS.USER_REJECTED) {
    return 'user_rejected'
  }
  try {
    const auth = wx.getStorageSync('order_album_auth_v1') || {}
    if (auth[albumId] === 'rejected') return 'user_rejected'
    if (auth[albumId] === 'authorized') return 'pending_review'
  } catch (e) {
    /* ignore */
  }
  return 'private'
}

function buildVehicleTitle(vehicle) {
  if (!vehicle) return '车辆'
  const parts = [vehicle.brand, vehicle.series].filter(Boolean)
  return parts.join(' ') || '车辆'
}

function buildNodesFromAuthorizeTask(albumNodes, task, albumId) {
  const assetMap = {}
  ;(task && task.rawAssets ? task.rawAssets : []).forEach((asset) => {
    const nodeId = asset.nodeId || 'node'
    if (!assetMap[nodeId]) assetMap[nodeId] = []
    const masked =
      asset.maskedUrl ||
      asset.preMaskedUrl ||
      mockDesensitizedUrl(asset.url, albumId, nodeId, asset.index || 0)
    if (masked) assetMap[nodeId].push(masked)
  })

  return (albumNodes || []).map((node) => {
    const fromTask = assetMap[node.id] || []
    const fallback = (node.images || []).map((url, index) =>
      mockDesensitizedUrl(url, albumId, node.id || 'node', index)
    )
    const imagesDesensitized = fromTask.length ? fromTask : fallback
    return {
      id: node.id,
      title: node.title,
      note: node.note || '',
      imagesDesensitized,
    }
  })
}

function buildCaseDraftFromOrder({ order, album, task }) {
  const albumId = album.albumId
  const caseId = `case_${order.id.replace(/^ord_/, '')}`
  const nodesWithMask = buildNodesFromAuthorizeTask(album.nodes, task, albumId)
  const coverImageDesensitized = pickDesensitizedCover(
    nodesWithMask.map((n) => ({ imagesDesensitized: n.imagesDesensitized }))
  )
  const vehicleTitle = buildVehicleTitle(order.vehicle)
  const serviceName = order.serviceName || '维修服务'
  const priceMode = order.priceMode || PRICE_MODE.RANGE

  return {
    id: caseId,
    source: CASE_SOURCE.PLATFORM_ORDER,
    orderId: order.id,
    serviceItemId: order.serviceId || '',
    coverImage: coverImageDesensitized,
    coverImageDesensitized,
    title: `${vehicleTitle} · ${serviceName}`,
    vehicleText: `${vehicleTitle}（已脱敏）`,
    serviceName,
    summary:
      album.storeNote ||
      `平台订单案例，用户授权公开。展示${serviceName}维修过程与节点记录。`,
    priceMode,
    minAmount: order.serviceMinAmount,
    maxAmount: order.serviceMaxAmount,
    storeId: order.storeId,
    storeName: order.storeName,
    city: '杭州',
    viewCount: 0,
    publishedAt: new Date().toISOString().slice(0, 10),
    tags: ['desensitized', 'audited'],
    aiSummary: `本案例为杭州${vehicleTitle}${serviceName}维修案例，图片已脱敏，价格区间为参考值，实际费用以门店检测为准。`,
    keyInfo: [
      { label: '城市', value: '杭州' },
      { label: '服务项目', value: serviceName },
      { label: '案例来源', value: '平台订单案例' },
    ],
    faultDesc: '用户到店反映车辆需进行相关检查与维修，门店按流程完成服务。',
    inspectResult: '门店完成相关部位检查，并按方案施工。',
    repairPlan: '按标准流程完成检测、施工、试车与交车确认。',
    priceFactors: ['车型与年款', '配件品牌', '损伤程度', '是否需要额外拆装'],
    nodes: nodesWithMask,
    faq: buildCaseFaq(serviceName),
    maskingConfirmed: true,
    publicCaseStatus: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
  }
}

/**
 * 用户确认脱敏后提交公开案例（mock 自动审核通过）
 * @param {{ orderId: string, albumId: string, taskId: string }} payload
 */
async function submitOrderPublicCaseReview(payload) {
  const { orderId, albumId, taskId } = payload || {}
  if (!orderId || !albumId) {
    const err = new Error('缺少订单或相册信息')
    err.code = 400
    throw err
  }

  const order = mockGetOrder(orderId)
  if (!order) {
    const err = new Error('订单不存在')
    err.code = 404
    throw err
  }

  const { mockFetchOrderAlbum } = require('../mock/order-album')
  const albumView = await mockFetchOrderAlbum(orderId)
  const album = {
    albumId: albumView.albumId,
    nodes: albumView.nodes,
    storeNote: albumView.storeNote,
  }

  let task = null
  if (taskId) {
    try {
      task = await fetchTask(taskId)
    } catch (e) {
      task = null
    }
  }

  setPublicCaseMeta(albumId, {
    orderId,
    status: PUBLIC_CASE_STATUS.PENDING_REVIEW,
    caseId: '',
  })

  await delay(420)

  const draft = buildCaseDraftFromOrder({ order, album, task })
  const caseItem = publishCaseFromOrderAlbum(draft)

  setPublicCaseMeta(albumId, {
    orderId,
    status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
    caseId: caseItem.id,
  })

  return { caseItem, status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED }
}

module.exports = {
  getPublicCaseMeta,
  resolvePublicCaseUiStatus,
  submitOrderPublicCaseReview,
  buildCaseDraftFromOrder,
}
