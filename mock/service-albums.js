/**
 * MOCK: V2.0 用户服务相册 — 联调后由 services/service-album.js 接真实 API
 */
const { ALLOW_TEST_OWNER_PHONE } = require('../services/config')
const {
  SERVICE_ALBUM_STATUS,
  SERVICE_ALBUM_REPAIR_DONE_STATUSES,
  MERCHANT_SERVICE_ALBUM_TAB_STATUS_MAP,
} = require('../constants/service-album-status')
const { filterUserAlbumsByTab } = require('../utils/service-album-tab-filter')
const { buildEmptyStageNodes } = require('../constants/service-album-stages')
const {
  MOCK_TEMPLATE_OPTIONS,
  MOCK_TEMPLATE_NODE_TITLES,
} = require('../services/service-album-template')
const { PART_TYPE } = require('../constants/part-type')
const { isLoggedIn, getSession } = require('../utils/auth')
const { findStore } = require('../services/store')
const { resolvePublicCaseUiStatus } = require('../services/public-case')
const {
  ensureServicePreMaskTask,
  shouldRunServicePreMask,
} = require('../services/desensitize')
const {
  resolvePlanAmount,
  normalizePlanAmountPayload,
  buildPrivateAlbumPrice,
  formatPlanAmountLabel,
} = require('../utils/album-price')
const { buildAlbumSummaryFields } = require('../utils/album-summary')
const { albumMatchesUserVehicle } = require('../utils/album-vehicle-match')
const {
  hydrateEvidenceItems,
  sanitizeEvidenceItemsPayload,
  mergeEvidenceIntoNodes,
} = require('../utils/album-evidence-items')

const {
  resolveAlbumCoverUrl,
  buildAlbumListStageProgress,
} = require('../utils/service-album-display')
const { SHARE_MODE } = require('../constants/album-share')

const STORAGE_KEY = 'service_albums_v1'
const SHARE_TOKEN_STORAGE = 'album_share_tokens_v1'
const CONFIRM_STORAGE_KEY = 'service_album_confirm_v1'
const AUTH_STORAGE_KEY = 'service_album_auth_v1'
const MOCK_VEHICLE_STORAGE = 'mock_user_vehicles'

const MOCK_ALBUMS = [
  {
    albumId: 'alb_svc_in_progress',
    storeId: 'store_demo_001',
    serviceName: '小保养套餐',
    complexityLevel: 'L1',
    status: SERVICE_ALBUM_STATUS.IN_PROGRESS,
    userPhone: '13812345678',
    vehicle: { brand: '大众', series: '朗逸', plateDisplay: '浙A****8' },
    createdAt: '2026-05-20T09:00:00.000Z',
    updatedAt: '2026-05-22T14:30:00.000Z',
    storeNote: '常规保养进行中，机油机滤已更换。',
    planAmount: 430,
    pendingConfirms: [],
    nodes: [
      {
        id: 'stage_1',
        title: '接车记录',
        status: 'completed',
        images: ['mock://service-album/alb_svc_in_progress/stage_1/0', 'mock://service-album/alb_svc_in_progress/stage_1/1'],
        note: '车辆已登记，开始常规保养流程。',
        updatedAt: '2026-05-20T09:15:00.000Z',
      },
      {
        id: 'stage_2',
        title: '检测诊断',
        status: 'completed',
        images: ['mock://service-album/alb_svc_in_progress/stage_2/0'],
        note: '机油液位正常，机滤建议更换。',
        updatedAt: '2026-05-20T09:30:00.000Z',
      },
      {
        id: 'stage_3',
        title: '方案与报价',
        status: 'completed',
        images: [],
        note: '本次方案报价 ¥430。',
        updatedAt: '2026-05-20T09:35:00.000Z',
      },
      {
        id: 'stage_4',
        title: '配件告知',
        status: 'completed',
        images: ['mock://service-album/alb_svc_in_progress/stage_4/0'],
        note: '使用原厂机油机滤。',
        updatedAt: '2026-05-20T10:00:00.000Z',
      },
      {
        id: 'stage_5',
        title: '施工记录',
        status: 'active',
        images: [
          'mock://service-album/alb_svc_in_progress/stage_5/0',
          'mock://service-album/alb_svc_in_progress/stage_5/1',
        ],
        note: '正在更换机油机滤并检查灯光胎压。',
        updatedAt: '2026-05-22T14:30:00.000Z',
      },
      {
        id: 'stage_6',
        title: '完工交付',
        status: 'pending',
        images: [],
        note: '',
        updatedAt: '',
      },
    ],
  },
  {
    albumId: 'alb_svc_pending_confirm',
    storeId: 'store_demo_002',
    serviceName: '左前大灯更换',
    complexityLevel: 'L3',
    status: SERVICE_ALBUM_STATUS.IN_PROGRESS,
    userPhone: '13812345678',
    vehicle: { brand: '宝马', series: '3系', plateDisplay: '浙A****6' },
    createdAt: '2026-05-18T10:00:00.000Z',
    updatedAt: '2026-05-23T11:00:00.000Z',
    storeNote: '左前大灯损坏，已拆检确认需更换总成。',
    pendingConfirms: [],
    parts: [
      {
        partId: 'part_headlight_001',
        partName: '左前大灯总成',
        partBrand: '海拉',
        partType: PART_TYPE.AFTERMARKET,
        actualPrice: 1680,
        diffDesc: '非主机厂渠道采购，包装与原厂存在差异。',
        photos: [],
      },
    ],
    nodes: [
      {
        id: 'stage_1',
        title: '接车记录',
        status: 'completed',
        images: ['mock://service-album/alb_svc_pending_confirm/stage_1/0'],
        note: '左前灯罩破裂，已拍照记录。',
        updatedAt: '2026-05-18T10:15:00.000Z',
      },
      {
        id: 'stage_2',
        title: '检测诊断',
        status: 'completed',
        images: ['mock://service-album/alb_svc_pending_confirm/stage_2/0', 'mock://service-album/alb_svc_pending_confirm/stage_2/1'],
        note: '灯座完好，建议更换大灯总成。',
        updatedAt: '2026-05-18T11:00:00.000Z',
      },
      {
        id: 'stage_3',
        title: '方案与报价',
        status: 'completed',
        images: [],
        note: '已提交维修方案，待车主确认。',
        updatedAt: '2026-05-18T11:30:00.000Z',
      },
      {
        id: 'stage_4',
        title: '配件告知',
        status: 'active',
        images: ['mock://service-album/alb_svc_pending_confirm/stage_4/0'],
        note: '拟使用副厂大灯总成，已录入配件信息。',
        updatedAt: '2026-05-23T11:00:00.000Z',
      },
      {
        id: 'stage_5',
        title: '施工记录',
        status: 'pending',
        images: [],
        note: '',
        updatedAt: '',
      },
      {
        id: 'stage_6',
        title: '完工交付',
        status: 'pending',
        images: [],
        note: '',
        updatedAt: '',
      },
    ],
  },
  {
    albumId: 'alb_svc_completed',
    storeId: 'store_demo_001',
    serviceName: '刹车片更换',
    complexityLevel: 'L2',
    status: SERVICE_ALBUM_STATUS.COMPLETED,
    userPhone: '13812345678',
    vehicle: { brand: '奥迪', series: 'A4L', plateDisplay: '浙A****2' },
    createdAt: '2026-05-10T08:00:00.000Z',
    updatedAt: '2026-05-15T16:00:00.000Z',
    completedAt: '2026-05-15T16:00:00.000Z',
    storeNote: '前刹车片磨损严重，已更换新件并完成试车。如需公开为案例，可在下方授权。',
    pendingConfirms: [],
    nodes: [
      {
        id: 'stage_1',
        title: '接车记录',
        status: 'completed',
        images: ['mock://service-album/alb_svc_completed/stage_1/0'],
        note: '制动异响，到店检测。',
        updatedAt: '2026-05-10T08:30:00.000Z',
      },
      {
        id: 'stage_2',
        title: '检测诊断',
        status: 'completed',
        images: ['mock://service-album/alb_svc_completed/stage_2/0', 'mock://service-album/alb_svc_completed/stage_2/1'],
        note: '前刹车片厚度不足。',
        updatedAt: '2026-05-10T09:00:00.000Z',
      },
      {
        id: 'stage_3',
        title: '方案与报价',
        status: 'completed',
        images: [],
        note: '参考总价 ¥680–880，以线下确认为准。',
        updatedAt: '2026-05-10T09:15:00.000Z',
      },
      {
        id: 'stage_4',
        title: '配件告知',
        status: 'completed',
        images: ['mock://service-album/alb_svc_completed/stage_4/0'],
        note: '使用品牌刹车片。',
        updatedAt: '2026-05-10T09:30:00.000Z',
      },
      {
        id: 'stage_5',
        title: '施工记录',
        status: 'completed',
        images: ['mock://service-album/alb_svc_completed/stage_5/0', 'mock://service-album/alb_svc_completed/stage_5/1'],
        note: '新旧件对比已拍照，安装后试车正常。',
        updatedAt: '2026-05-15T15:00:00.000Z',
      },
      {
        id: 'stage_6',
        title: '完工交付',
        status: 'completed',
        images: ['mock://service-album/alb_svc_completed/stage_6/0', 'mock://service-album/alb_svc_completed/stage_6/1'],
        note: '试车正常，制动效果良好。',
        updatedAt: '2026-05-15T16:00:00.000Z',
      },
    ],
    evidenceItems: [
      {
        id: 'repair_quote',
        category: 'document',
        type: 'repair_quote',
        stageId: 'stage_3',
        label: '维修报价单',
        strength: 'strongly_recommended',
        images: ['mock://service-album/alb_svc_completed/stage_3/quote'],
      },
      {
        id: 'work_order',
        category: 'document',
        type: 'work_order',
        stageId: 'stage_5',
        label: '施工工单',
        strength: 'recommended',
        images: ['mock://service-album/alb_svc_completed/stage_5/0'],
      },
      {
        id: 'settlement',
        category: 'document',
        type: 'settlement',
        stageId: 'stage_6',
        label: '维修结算单',
        strength: 'recommended',
        images: ['mock://service-album/alb_svc_completed/stage_6/0'],
      },
    ],
  },
  {
    albumId: 'alb_svc_body_paint',
    storeId: 'store_demo_001',
    serviceName: '左后门钣喷修复',
    complexityLevel: 'L3',
    status: SERVICE_ALBUM_STATUS.IN_PROGRESS,
    userPhone: '13812345678',
    templateId: 'body_paint',
    templateName: '钣喷修复',
    vehicle: { brand: '本田', series: '雅阁', plateDisplay: '浙A****3' },
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-05T18:00:00.000Z',
    storeNote: '左后门划痕凹陷，已完成局部钣喷。',
    pendingConfirms: [],
    nodes: [
      {
        id: 'stage_1',
        title: '损伤状态',
        status: 'completed',
        images: [
          'mock://service-album/alb_svc_body_paint/stage_1/0',
          'mock://service-album/alb_svc_body_paint/stage_1/1',
        ],
        note: '左后门划痕与凹陷近景。',
        updatedAt: '2026-06-01T10:20:00.000Z',
      },
      {
        id: 'stage_2',
        title: '损伤评估',
        status: 'completed',
        images: [
          'mock://service-album/alb_svc_body_paint/stage_2/0',
          'mock://service-album/alb_svc_body_paint/stage_2/1',
        ],
        note: '两处损伤近景评估。',
        updatedAt: '2026-06-01T11:00:00.000Z',
      },
      {
        id: 'stage_3',
        title: '修复方案',
        status: 'completed',
        images: [],
        note: '局部钣喷方案 ¥1680。',
        updatedAt: '2026-06-01T11:30:00.000Z',
      },
      {
        id: 'stage_4',
        title: '施工过程',
        status: 'completed',
        images: ['mock://service-album/alb_svc_body_paint/stage_4/0'],
        note: '打磨补土进行中。',
        updatedAt: '2026-06-03T15:00:00.000Z',
      },
      {
        id: 'stage_5',
        title: '前后对比',
        status: 'completed',
        images: [
          'mock://service-album/alb_svc_body_paint/stage_5/0',
          'mock://service-album/alb_svc_body_paint/stage_5/1',
        ],
        note: '同一角度维修前后。',
        updatedAt: '2026-06-05T16:00:00.000Z',
      },
      {
        id: 'stage_6',
        title: '完工结果',
        status: 'completed',
        images: [
          'mock://service-album/alb_svc_body_paint/stage_6/0',
          'mock://service-album/alb_svc_body_paint/stage_6/1',
        ],
        note: '漆面已交付，色差检查通过。',
        updatedAt: '2026-06-05T18:00:00.000Z',
      },
    ],
  },
]

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadAlbumMap() {
  try {
    const stored = wx.getStorageSync(STORAGE_KEY) || {}
    const base = {}
    MOCK_ALBUMS.forEach((album) => {
      base[album.albumId] = { ...album }
    })
    return { ...base, ...stored }
  } catch (e) {
    const base = {}
    MOCK_ALBUMS.forEach((album) => {
      base[album.albumId] = { ...album }
    })
    return base
  }
}

function saveAlbumMap(map) {
  wx.setStorageSync(STORAGE_KEY, map)
}

function loadConfirmMap() {
  try {
    return wx.getStorageSync(CONFIRM_STORAGE_KEY) || {}
  } catch (e) {
    return {}
  }
}

function saveConfirmMap(map) {
  wx.setStorageSync(CONFIRM_STORAGE_KEY, map)
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

function countAlbumImages(nodes) {
  return (nodes || []).reduce((sum, n) => sum + ((n.images && n.images.length) || 0), 0)
}

function buildVehicleDisplay(vehicle) {
  if (!vehicle) return '—'
  const model = [vehicle.brand, vehicle.series].filter(Boolean).join(' ')
  const plate = vehicle.plateDisplay || ''
  if (model && plate) return `${model} / ${plate}`
  return model || plate || '—'
}

function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

function getUserPhone() {
  const { user } = getSession()
  if (!user || !user.isPhoneBound) return ''
  return user.phoneDisplay === '138****5678' ? '13812345678' : '13812345678'
}

function resolveStoreBlock(storeId) {
  const store = storeId ? findStore(storeId) : null
  return {
    id: (store && store.id) || storeId || '',
    name: (store && store.name) || '—',
    phone: (store && store.phone) || '',
    address: (store && store.address) || '—',
  }
}

function applyConfirmOverrides(album) {
  return { ...album, pendingConfirms: [] }
}

function resolvePublicCaseStatus(albumId) {
  const authMap = loadAuthMap()
  if (authMap[albumId] === 'rejected') return 'user_rejected'
  if (authMap[albumId] === 'authorized') {
    const ui = resolvePublicCaseUiStatus(albumId)
    return ui === 'public_approved' ? 'public_approved' : 'pending_review'
  }
  return resolvePublicCaseUiStatus(albumId)
}

function mapNodesForView(nodes) {
  return (nodes || []).map((node) => ({
    ...node,
    updatedAtText: node.updatedAt ? formatDateTime(node.updatedAt) : '',
  }))
}

function resolveAlbumEvidenceItems(album, nodes) {
  const saved = Array.isArray(album.evidenceItems) ? album.evidenceItems : []
  return hydrateEvidenceItems({
    templateId: album.templateId,
    savedItems: saved,
    nodes,
  })
}

function buildAlbumViewModel(raw) {
  const album = applyConfirmOverrides(raw)
  const store = resolveStoreBlock(album.storeId)
  const imageCount = countAlbumImages(album.nodes)
  const nodes = mapNodesForView(album.nodes)
  const publicCaseStatus = resolvePublicCaseStatus(album.albumId)
  const pendingCount = (album.pendingConfirms || []).length

  const view = {
    albumId: album.albumId,
    serviceName: album.serviceName,
    store,
    status: album.status,
    complexityLevel: album.complexityLevel || 'L1',
    vehicleDisplay: buildVehicleDisplay(album.vehicle),
    vehicle: album.vehicle,
    imageCount,
    storeNote: album.storeNote || '',
    nodes,
    evidenceItems: resolveAlbumEvidenceItems(album, nodes),
    pendingConfirms: album.pendingConfirms || [],
    pendingCount,
    publicCaseStatus,
    createdAt: album.createdAt,
    updatedAt: album.updatedAt,
    completedAt: album.completedAt || '',
    templateId: album.templateId || '',
    templateName: album.templateName || '',
    createdAtText: formatDateTime(album.createdAt),
    updatedAtText: formatDateTime(album.updatedAt),
    summaryRows: [],
  }
  const privatePrice = buildPrivateAlbumPrice(album)
  view.planAmount = privatePrice.planAmount
  view.priceMode = privatePrice.priceMode
  view.amount = privatePrice.amount

  const summaryFields = buildAlbumSummaryFields(
    {
      createdAt: album.createdAt,
      updatedAt: album.updatedAt,
      storeNote: album.storeNote,
      partsJson: album.parts || [],
      vehicleJson: album.vehicle,
    },
    {
      ...view,
      formatPlanAmountLabel,
    },
    privatePrice,
  )
  Object.assign(view, summaryFields)
  return view
}

function filterAlbumsByTab(albums, tab, statusMap) {
  const statusList = statusMap[tab]
  if (!statusList) return albums.slice()
  return albums.filter((a) => statusList.includes(applyConfirmOverrides(a).status))
}

function filterAlbumsForUser(albums, tab) {
  const phone = getUserPhone()
  let list = albums.filter((a) => a.userPhone === phone)
  list = filterUserAlbumsByTab(list, tab || 'all', (album) =>
    resolvePublicCaseStatus(album.albumId)
  )
  return list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}

function filterAlbumsForMerchant(albums, tab) {
  let list = albums.slice()
  list = filterAlbumsByTab(list, tab || 'all', MERCHANT_SERVICE_ALBUM_TAB_STATUS_MAP)
  return list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}

function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone || ''
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

function buildMockGeoEvidence(album, nodes) {
  const imageCount = countAlbumImages(nodes)
  const missingFields = []
  const hasStageEvidence = (stageId) => {
    const node = (nodes || []).find((n) => n.id === stageId)
    if (!node) return false
    return (node.images || []).length > 0 || String(node.note || '').trim()
  }
  if (imageCount < 1) {
    missingFields.push({ field: 'images', message: '请至少上传一张过程图' })
  }
  if (!hasStageEvidence('stage_1')) {
    missingFields.push({
      field: 'stage_1',
      message: '请补充接车记录：故障现象或需求说明，或上传接车图片',
    })
  }
  if (!hasStageEvidence('stage_2')) {
    missingFields.push({
      field: 'stage_2',
      message: '请补充检测诊断：检查结论说明，或上传检测图片',
    })
  }
  const planAmount = album.planAmount ?? album.planMinAmount
  const hasPlan =
    hasStageEvidence('stage_3') ||
    (planAmount != null && planAmount !== '' && Number.isFinite(Number(planAmount)))
  if (!hasPlan) {
    missingFields.push({
      field: 'stage_3',
      message: '请补充方案与报价：维修方案说明，或填写方案报价金额',
    })
  }
  const level = missingFields.length ? 'block' : 'ready'
  return {
    level,
    score: level === 'block' ? 40 : 85,
    summaryText:
      level === 'block' ? `缺 ${missingFields.length} 项关键证据` : '关键阶段证据齐全',
    missingCount: missingFields.length,
    missingFields,
  }
}

function buildMockCompleteness(album, nodes) {
  const total = (nodes || []).length
  const filled = (nodes || []).filter(
    (n) => (n.images || []).length > 0 || String(n.note || '').trim()
  ).length
  return {
    filledStages: filled,
    totalStages: total,
    requiredStages: 0,
    requiredFilled: 0,
    summaryText: `已上传 ${filled}/${total} 个阶段`,
    geoEvidence: buildMockGeoEvidence(album, nodes),
  }
}

function buildMerchantAlbumView(raw) {
  const album = applyConfirmOverrides(raw)
  const store = resolveStoreBlock(album.storeId)
  const imageCount = countAlbumImages(album.nodes)
  const privatePrice = buildPrivateAlbumPrice(album)
  const publicCaseStatus = resolvePublicCaseStatus(album.albumId)
  const hasOwner = Boolean(String(album.userPhone || '').trim())
  const isCompleted =
    album.status === SERVICE_ALBUM_STATUS.COMPLETED ||
    album.status === SERVICE_ALBUM_STATUS.PUBLISHED
  const canSubmitColdStartPublicCase = false
  const nodes = mapNodesForView(album.nodes)
  return {
    albumId: album.albumId,
    storeId: album.storeId,
    serviceId: album.serviceId || '',
    serviceName: album.serviceName,
    complexityLevel: album.complexityLevel || 'L1',
    status: album.status,
    userPhone: album.userPhone || '',
    userPhoneDisplay: maskPhone(album.userPhone),
    hasOwner,
    vehicle: album.vehicle || {},
    vehicleDisplay: buildVehicleDisplay(album.vehicle),
    storeName: store.name,
    storeNote: album.storeNote || '',
    templateId: album.templateId || '',
    templateName: album.templateName || '',
    nodes,
    evidenceItems: resolveAlbumEvidenceItems(album, nodes),
    parts: album.parts || [],
    planAmount: privatePrice.planAmount,
    planMinAmount: privatePrice.planAmount,
    planMaxAmount: privatePrice.planAmount,
    priceMode: privatePrice.priceMode,
    amount: privatePrice.amount,
    imageCount,
    publicCaseStatus,
    canSubmitColdStartPublicCase,
    invitePath: `/pages/album/detail/index?albumId=${album.albumId}&from=merchant_share`,
    claimPath: `/pages/album/claim/index?albumId=${album.albumId}`,
    createdAt: album.createdAt,
    updatedAt: album.updatedAt,
    updatedAtText: formatDateTime(album.updatedAt),
    completedAt: album.completedAt || '',
    completeness: buildMockCompleteness(album, nodes),
    planParts: album.planParts || [],
    planPartsLocked: Boolean(album.planPartsLockedAt),
    planPartsLockedAt: album.planPartsLockedAt || '',
    planQuoteThumbs: (() => {
      const stage3 = (album.nodes || []).find((n) => n.id === 'stage_3')
      return (stage3 && stage3.images) || []
    })(),
    amountMismatch: false,
    amountMismatchHint: '',
    partVerifyGuideText: album.partVerifyGuideText || '',
    partVerifyGuideInformed: Boolean(album.partVerifyGuideInformed),
  }
}

function findMockVehicleRow(vehicleId) {
  try {
    const rows = wx.getStorageSync(MOCK_VEHICLE_STORAGE) || []
    const { user } = getSession()
    const userId = (user && user.userId) || 'mock_user'
    return (
      rows.find(
        (row) => row.id === vehicleId && row.userId === userId && !row.deletedAt,
      ) || null
    )
  } catch (err) {
    return null
  }
}

function listMockUserAlbumSources() {
  const map = loadAlbumMap()
  return filterAlbumsForUser(Object.values(map), 'all')
}

function countMockUserAlbumsForVehicle(vehicleRow) {
  if (!vehicleRow) return 0
  return listMockUserAlbumSources().filter((raw) => {
    const view = buildAlbumViewModel(raw)
    return view.imageCount > 0 && albumMatchesUserVehicle(raw.vehicle, vehicleRow)
  }).length
}

async function mockFetchUserServiceAlbums(options = {}) {
  await delay()
  if (!isLoggedIn()) {
    const err = new Error('请先登录')
    err.code = 401
    throw err
  }
  const phone = getUserPhone()
  if (!phone) {
    const err = new Error('请先绑定手机号')
    err.code = 403
    throw err
  }
  const map = loadAlbumMap()
  const albums = Object.values(map)
  let filtered = filterAlbumsForUser(albums, options.tab || 'all')
  if (options.vehicleId) {
    const vehicle = findMockVehicleRow(options.vehicleId)
    if (!vehicle) {
      const err = new Error('车辆不存在')
      err.code = 404
      throw err
    }
    filtered = filtered.filter((raw) => albumMatchesUserVehicle(raw.vehicle, vehicle))
  }
  return filtered
    .map((raw) => {
      const view = buildAlbumViewModel(raw)
      return {
        id: view.albumId,
        albumId: view.albumId,
        serviceName: view.serviceName,
        storeName: view.store.name,
        storeId: view.store.id,
        vehicleDisplay: view.vehicleDisplay,
        status: view.status,
        imageCount: view.imageCount,
        pendingCount: 0,
        publicCaseStatus: view.publicCaseStatus,
        createdAt: view.createdAt,
        updatedAt: view.updatedAt,
        isPublic: view.publicCaseStatus === 'public_approved',
        coverUrl: resolveAlbumCoverUrl({ nodes: raw.nodes }),
        stageProgress: buildAlbumListStageProgress({ nodes: raw.nodes }),
        deliverDateText: view.deliverDateText,
        summaryLine: view.summaryLine,
        summaryRows: view.summaryRows,
        partsSummary: view.partsSummary,
      }
    })
    .filter((item) => item.imageCount > 0)
}

async function mockFetchServiceAlbum(albumId) {
  await delay()
  if (!isLoggedIn()) {
    const err = new Error('请先登录')
    err.code = 401
    throw err
  }
  const phone = getUserPhone()
  if (!phone) {
    const err = new Error('请先绑定手机号后查看服务相册')
    err.code = 403
    throw err
  }
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('相册不存在或已被删除')
    err.code = 404
    throw err
  }
  if (raw.userPhone !== phone) {
    const err = new Error('仅关联车主可查看，请确认登录手机号与门店登记一致')
    err.code = 403
    throw err
  }

  const view = buildAlbumViewModel(raw)
  if (shouldRunServicePreMask(view.status) && view.imageCount > 0) {
    await ensureServicePreMaskTask(view.albumId, view.nodes)
  }
  return view
}

async function mockSubmitPartConfirm(albumId, confirmId, payload = {}) {
  await delay(400)
  if (!isLoggedIn()) {
    const err = new Error('请先登录')
    err.code = 401
    throw err
  }
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('相册不存在')
    err.code = 404
    throw err
  }

  const confirmMap = loadConfirmMap()
  if (!confirmMap[albumId]) confirmMap[albumId] = {}

  if (payload.rejected) {
    confirmMap[albumId][confirmId] = { status: 'rejected', rejectedAt: new Date().toISOString() }
    saveConfirmMap(confirmMap)
    return mockFetchServiceAlbum(albumId)
  }

  confirmMap[albumId][confirmId] = {
    status: 'confirmed',
    confirmedAt: new Date().toISOString(),
    checkboxText: payload.checkboxText || '',
    buttonText: payload.buttonText || '',
  }
  saveConfirmMap(confirmMap)
  return mockFetchServiceAlbum(albumId)
}

async function mockSubmitServiceAlbumAuthorization(albumId, payload = {}) {
  await delay(400)
  if (!isLoggedIn()) {
    const err = new Error('请先登录')
    err.code = 401
    throw err
  }
  const authMap = loadAuthMap()
  if (payload.agreed === false) {
    authMap[albumId] = 'rejected'
    saveAuthMap(authMap)
    return { publicCaseStatus: 'user_rejected' }
  }
  authMap[albumId] = 'authorized'
  saveAuthMap(authMap)
  return { publicCaseStatus: 'authorized' }
}

async function mockFetchUserAuthorizations() {
  await delay()
  if (!isLoggedIn()) {
    const err = new Error('请先登录')
    err.code = 401
    throw err
  }
  const phone = getUserPhone()
  if (!phone) {
    const err = new Error('请先绑定手机号')
    err.code = 403
    throw err
  }

  const map = loadAlbumMap()
  const authMap = loadAuthMap()
  const albums = Object.values(map).filter((a) => a.userPhone === phone)

  return albums
    .map((raw) => {
      const view = buildAlbumViewModel(raw)
      const authStatus = authMap[view.albumId] || 'none'
      const needsAuthorization =
        view.status === 'completed' &&
        view.publicCaseStatus === 'private' &&
        authStatus === 'none'
      if (authStatus === 'none' && view.publicCaseStatus === 'private' && !needsAuthorization) {
        return null
      }
      return {
        id: view.albumId,
        albumId: view.albumId,
        serviceName: view.serviceName,
        storeName: view.store.name,
        vehicleDisplay: view.vehicleDisplay,
        coverImage: (view.nodes[0] && view.nodes[0].images && view.nodes[0].images[0]) || '',
        authStatus:
          authStatus === 'rejected'
            ? 'rejected'
            : view.publicCaseStatus === 'public_approved'
              ? 'approved'
              : authStatus === 'authorized'
                ? 'pending_review'
                : 'none',
        publicCaseStatus: view.publicCaseStatus,
        reviewStatus:
          view.publicCaseStatus === 'public_approved'
            ? 'approved'
            : view.publicCaseStatus === 'pending_review'
              ? 'pending'
              : view.publicCaseStatus === 'user_rejected'
                ? 'rejected'
                : 'none',
        canWithdraw: ['pending_review', 'public_approved'].includes(view.publicCaseStatus),
        needsAuthorization,
        updatedAt: view.updatedAt,
        updatedAtText: view.updatedAtText,
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}

async function mockWithdrawAuthorization(albumId) {
  await delay(320)
  const authMap = loadAuthMap()
  delete authMap[albumId]
  saveAuthMap(authMap)
  const map = loadAlbumMap()
  if (map[albumId]) {
    map[albumId].status = SERVICE_ALBUM_STATUS.COMPLETED
    saveAlbumMap(map)
  }
  const { setPublicCaseMeta } = require('../services/public-case')
  const { PUBLIC_CASE_STATUS } = require('../constants/public-case-status')
  setPublicCaseMeta(albumId, { status: PUBLIC_CASE_STATUS.PRIVATE })
  return { ok: true }
}

function mockCountPendingConfirm() {
  return 0
}

function mockCountPendingAuth() {
  if (!isLoggedIn()) return 0
  const phone = getUserPhone()
  if (!phone) return 0
  const map = loadAlbumMap()
  return Object.values(map)
    .filter((a) => a.userPhone === phone && a.status === SERVICE_ALBUM_STATUS.COMPLETED)
    .filter((a) => resolvePublicCaseStatus(a.albumId) === 'private')
    .filter((a) => countAlbumImages(a.nodes) > 0).length
}

async function mockFetchMerchantServiceAlbumList(options = {}) {
  await delay()
  const map = loadAlbumMap()
  const filtered = filterAlbumsForMerchant(Object.values(map), options.tab || 'all')
  return filtered.map((raw) => {
    const view = buildMerchantAlbumView(raw)
    const coverUrl =
      (view.nodes &&
        view.nodes[0] &&
        view.nodes[0].images &&
        view.nodes[0].images[0]) ||
      ''
    return {
      albumId: view.albumId,
      serviceName: view.serviceName,
      vehicleDisplay: view.vehicleDisplay,
      status: view.status,
      imageCount: view.imageCount,
      userPhoneDisplay: view.userPhoneDisplay,
      updatedAt: view.updatedAt,
      updatedAtText: view.updatedAtText,
      coverUrl,
    }
  })
}

async function mockFetchMerchantServiceAlbum(albumId) {
  await delay()
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('档案不存在或已被删除')
    err.code = 404
    throw err
  }
  return buildMerchantAlbumView(raw)
}

async function mockCreateMerchantServiceAlbum(payload) {
  await delay(350)
  if (!ALLOW_TEST_OWNER_PHONE && payload.userPhone && String(payload.userPhone).trim()) {
    const err = new Error('车主手机号须由车主扫码关联，商家不可代填')
    err.code = 400
    throw err
  }
  const albumId = `alb_svc_${Date.now()}`
  const now = new Date().toISOString()
  const normalized = normalizePlanAmountPayload(payload)
  const album = {
    albumId,
    storeId: payload.storeId,
    serviceId: payload.serviceId || '',
    serviceName: payload.serviceName,
    complexityLevel: payload.complexityLevel || 'L1',
    status: SERVICE_ALBUM_STATUS.DRAFT,
    userPhone: payload.userPhone || '',
    vehicle: payload.vehicle || {},
    storeNote: '',
    pendingConfirms: [],
    parts: [],
    planAmount: normalized.planAmount,
    planMinAmount: normalized.planMinAmount,
    planMaxAmount: normalized.planMaxAmount,
    priceMode: normalized.priceMode || '',
    nodes: buildEmptyStageNodes(),
    createdAt: now,
    updatedAt: now,
  }
  const map = loadAlbumMap()
  map[albumId] = album
  saveAlbumMap(map)
  return buildMerchantAlbumView(album)
}

async function mockSaveMerchantServiceAlbum(albumId, payload) {
  await delay(320)
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('档案不存在')
    err.code = 404
    throw err
  }
  const now = new Date().toISOString()
  const normalized = normalizePlanAmountPayload(payload)
  if (!ALLOW_TEST_OWNER_PHONE && payload.userPhone != null && String(payload.userPhone || '').trim()) {
    const err = new Error('车主手机号须由车主扫码关联，商家不可代填')
    err.code = 400
    throw err
  }
  const userPhone =
    ALLOW_TEST_OWNER_PHONE && payload.userPhone != null
      ? String(payload.userPhone || '').trim()
      : raw.userPhone
  const evidenceItems =
    payload.evidenceItems != null
      ? sanitizeEvidenceItemsPayload(payload.evidenceItems)
      : raw.evidenceItems || []
  const mergedNodes = mergeEvidenceIntoNodes(payload.nodes || raw.nodes, evidenceItems)
  const next = {
    ...raw,
    ...normalized,
    userPhone,
    nodes: mergedNodes,
    evidenceItems,
    parts: payload.parts || raw.parts,
    partVerifyGuideText:
      payload.partVerifyGuideInformed != null && payload.partVerifyGuideInformed
        ? ''
        : payload.partVerifyGuideText != null
          ? String(payload.partVerifyGuideText || '').trim()
          : raw.partVerifyGuideText || '',
    partVerifyGuideInformed:
      payload.partVerifyGuideInformed != null
        ? Boolean(payload.partVerifyGuideInformed)
        : Boolean(raw.partVerifyGuideInformed),
    updatedAt: now,
  }
  if (next.status === SERVICE_ALBUM_STATUS.DRAFT && countAlbumImages(next.nodes) > 0) {
    next.status = SERVICE_ALBUM_STATUS.IN_PROGRESS
  }
  map[albumId] = next
  saveAlbumMap(map)
  return buildMerchantAlbumView(next)
}

async function mockCompleteMerchantServiceAlbum(albumId) {
  await delay(320)
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('档案不存在')
    err.code = 404
    throw err
  }
  if (countAlbumImages(raw.nodes) < 1) {
    const err = new Error('请至少上传一张过程图')
    err.code = 409
    throw err
  }
  const hasOwner = Boolean(String(raw.userPhone || '').trim())
  if (!hasOwner && !ALLOW_TEST_OWNER_PHONE) {
    const err = new Error('请先请车主扫码关联手机号后再继续')
    err.code = 409
    throw err
  }
  const now = new Date().toISOString()
  const next = {
    ...raw,
    status: SERVICE_ALBUM_STATUS.COMPLETED,
    completedAt: now,
    updatedAt: now,
  }
  map[albumId] = next
  saveAlbumMap(map)
  return buildMerchantAlbumView(next)
}

async function mockFetchMerchantAlbumStats() {
  await delay(120)
  const map = loadAlbumMap()
  const albums = Object.values(map)
  const active = filterAlbumsByTab(albums, 'active', MERCHANT_SERVICE_ALBUM_TAB_STATUS_MAP).length
  const pendingAuth = filterAlbumsByTab(albums, 'pending_auth', MERCHANT_SERVICE_ALBUM_TAB_STATUS_MAP)
    .filter((a) => a.status === SERVICE_ALBUM_STATUS.COMPLETED)
    .length
  const pendingUpload = albums.filter(
    (a) =>
      [SERVICE_ALBUM_STATUS.IN_PROGRESS, SERVICE_ALBUM_STATUS.DRAFT].includes(a.status) &&
      countAlbumImages(a.nodes) < 2
  ).length
  let geoEvidenceBlocked = 0
  albums.forEach((raw) => {
    const hasOwner = Boolean(String(raw.userPhone || '').trim())
    const isCompleted =
      raw.status === SERVICE_ALBUM_STATUS.COMPLETED ||
      raw.status === SERVICE_ALBUM_STATUS.PUBLISHED
    const publicCaseStatus = resolvePublicCaseStatus(raw.albumId)
    if (!isCompleted || hasOwner || publicCaseStatus !== 'private') return
    const nodes = mapNodesForView(raw.nodes)
    const geo = buildMockGeoEvidence(raw, nodes)
    if (geo.level === 'block') geoEvidenceBlocked += 1
  })
  return { active, pendingAuth, pendingUpload, geoEvidenceBlocked, total: albums.length }
}

async function mockFetchMerchantAlbumGeoPreview(albumId) {
  await delay(120)
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('档案不存在或已被删除')
    err.code = 404
    throw err
  }
  const view = buildMerchantAlbumView(raw)
  const geoEvidence = view.completeness && view.completeness.geoEvidence
  return {
    geoQuality: geoEvidence || { level: 'ready', score: 85, summaryText: '关键阶段证据齐全', missingFields: [], warnings: [] },
    geoPreview: {
      faultDesc: '',
      inspectResult: '',
      repairPlan: '',
      resultConfirm: '',
    },
    aiSummaryPreview: '',
  }
}

async function mockCreateMerchantColdStartPreview(albumId) {
  const err = new Error('未关联车主的相册不再支持商家单方提交公开，请由车主扫码关联后授权公示')
  err.code = 409
  throw err

  await delay(280)
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('档案不存在或已被删除')
    err.code = 404
    throw err
  }
  if (raw.userPhone) {
    const err = new Error('已关联车主，请由车主完成授权公示')
    err.code = 409
    throw err
  }
  if (raw.status !== SERVICE_ALBUM_STATUS.COMPLETED) {
    const err = new Error('请先标记服务相册已完工')
    err.code = 409
    throw err
  }
  if (countAlbumImages(raw.nodes) < 1) {
    const err = new Error('请至少上传一张过程图')
    err.code = 409
    throw err
  }

  const { createMerchantColdStartTaskFromPreMask } = require('../services/desensitize')
  if (shouldRunServicePreMask(raw.status)) {
    await ensureServicePreMaskTask(albumId, raw.nodes, { instant: true })
  }
  const task = await createMerchantColdStartTaskFromPreMask({
    bizId: albumId,
    nodes: raw.nodes,
  })
  return {
    taskId: task.taskId,
    albumId,
    fromPreMask: true,
    task,
  }
}

async function mockSubmitMerchantPublicCase(albumId, payload = {}) {
  await delay(360)
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('档案不存在或已被删除')
    err.code = 404
    throw err
  }
  if (raw.userPhone) {
    const err = new Error('已关联车主，请由车主完成授权公示')
    err.code = 409
    throw err
  }
  const publicCaseStatus = resolvePublicCaseStatus(albumId)
  if (publicCaseStatus === 'pending_review') {
    const err = new Error('公开案例审核中，请耐心等待')
    err.code = 409
    throw err
  }
  if (publicCaseStatus === 'public_approved') {
    const err = new Error('该案例已公开展示')
    err.code = 409
    throw err
  }

  const { fetchTask } = require('../services/desensitize')
  const { buildCaseDraftFromServiceAlbum } = require('../utils/case-content')
  const { setPublicCaseMeta } = require('../services/public-case')
  const { PUBLIC_CASE_STATUS } = require('../constants/public-case-status')

  const taskId = payload.taskId || `task_mch_${albumId}`
  const task = await fetchTask(taskId)
  if (!task || !task.maskingConfirmed) {
    const err = new Error('请先完成脱敏确认')
    err.code = 409
    throw err
  }

  const store = resolveStoreBlock(raw.storeId)
  const album = {
    albumId,
    serviceName: raw.serviceName,
    store: { id: raw.storeId, name: store.name, city: store.city || '杭州' },
    storeId: raw.storeId,
    storeName: store.name,
    city: store.city || '杭州',
    vehicle: raw.vehicle || {},
    nodes: raw.nodes,
    storeNote: raw.storeNote,
    planAmount: raw.planAmount,
  }
  const draft = buildCaseDraftFromServiceAlbum({
    album,
    task,
    coldStart: true,
  })

  setPublicCaseMeta(albumId, {
    status: PUBLIC_CASE_STATUS.PENDING_REVIEW,
    authorizationTier: 'private',
    caseId: draft.id,
  })

  return {
    caseItem: {
      id: draft.id,
      albumId,
      title: draft.title,
      authorizationTier: 'private',
      status: PUBLIC_CASE_STATUS.PENDING_REVIEW,
    },
    status: PUBLIC_CASE_STATUS.PENDING_REVIEW,
    message: '已提交审核，通过后将公开展示',
  }
}

function readShareTokens() {
  try {
    return wx.getStorageSync(SHARE_TOKEN_STORAGE) || {}
  } catch (e) {
    return {}
  }
}

function writeShareTokens(map) {
  try {
    wx.setStorageSync(SHARE_TOKEN_STORAGE, map)
  } catch (e) {
    /* ignore */
  }
}

function buildMockSharedView(album, mode) {
  const store = resolveStoreBlock(album.storeId)
  const nodes = (album.nodes || []).map((node) => {
    const images =
      mode === SHARE_MODE.ORIGINAL
        ? node.images || []
        : (node.images || []).map((url, idx) =>
            buildDesensitizedUrl(url, album.albumId, node.id, idx)
          )
    return {
      id: node.id,
      title: node.title,
      note: node.note || '',
      images,
    }
  })

  return {
    albumId: album.albumId,
    shareMode: mode,
    serviceName: album.serviceName || '—',
    store: { name: store.name, city: store.city || '杭州' },
    vehicleDisplay: buildVehicleDisplay(album.vehicle),
    storeNote: album.storeNote || '',
    nodes,
    disclaimer:
      mode === SHARE_MODE.ORIGINAL
        ? '本页由车主选择原图分享，可能包含隐私信息，请勿二次传播。'
        : '本页为车主分享的脱敏服务过程，不含完整车牌、手机号等隐私信息。',
  }
}

function getStoredAlbums() {
  const map = loadAlbumMap()
  return Object.values(map)
}

async function mockRecordAlbumShare(albumId, payload = {}) {
  const map = loadAlbumMap()
  const album = applyConfirmOverrides(map[albumId] || MOCK_ALBUMS.find((a) => a.albumId === albumId))
  if (!album) {
    const err = new Error('相册不存在')
    err.code = 404
    throw err
  }
  if (!SERVICE_ALBUM_REPAIR_DONE_STATUSES.includes(album.status)) {
    const err = new Error('相册尚未完工，暂不可分享')
    err.code = 400
    throw err
  }
  const mode =
    payload.mode === SHARE_MODE.ORIGINAL ? SHARE_MODE.ORIGINAL : SHARE_MODE.DESENSITIZED
  const shareToken = `sh_alb_mock_${Date.now().toString(36)}`
  const tokens = readShareTokens()
  tokens[shareToken] = {
    albumId,
    mode,
    channel: payload.channel || '',
    createdAt: Date.now(),
  }
  writeShareTokens(tokens)
  return {
    shareToken,
    mode,
    channel: payload.channel || '',
    miniPath: `/pages/album/share/index?token=${encodeURIComponent(shareToken)}`,
  }
}

async function mockFetchSharedAlbum(token) {
  const record = readShareTokens()[token]
  if (!record) {
    const err = new Error('分享链接无效或已失效')
    err.code = 404
    throw err
  }
  const map = loadAlbumMap()
  const album = applyConfirmOverrides(map[record.albumId] || MOCK_ALBUMS.find((a) => a.albumId === record.albumId))
  if (!album || album.status !== SERVICE_ALBUM_STATUS.COMPLETED) {
    const err = new Error('相册暂不可查看')
    err.code = 404
    throw err
  }
  return buildMockSharedView(album, record.mode)
}

async function mockFetchAlbumClaimPreview(albumId) {
  await delay()
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('相册不存在或已被删除')
    err.code = 404
    throw err
  }
  const store = resolveStoreBlock(raw.storeId)
  const hasOwner = Boolean(String(raw.userPhone || '').trim())
  const phone = isLoggedIn() ? getUserPhone() : ''
  const alreadyOwner = Boolean(phone && raw.userPhone === phone)
  let claimable = !hasOwner
  let reason = ''
  if (hasOwner && !alreadyOwner) {
    claimable = false
    reason = '该服务相册已关联其他车主'
  } else if (alreadyOwner) {
    claimable = false
    reason = '你已关联此服务相册'
  }
  return {
    albumId: raw.albumId,
    storeName: store.name,
    serviceName: raw.serviceName,
    vehicleDisplay: buildVehicleDisplay(raw.vehicle),
    claimable,
    alreadyOwner,
    hasOwner,
    reason,
  }
}

async function mockClaimServiceAlbum(albumId, payload = {}) {
  await delay(320)
  if (!payload.agreed) {
    const err = new Error('请先阅读并同意关联说明')
    err.code = 400
    throw err
  }
  if (!isLoggedIn()) {
    const err = new Error('请先登录')
    err.code = 401
    throw err
  }
  const phone = getUserPhone()
  if (!phone) {
    const err = new Error('请先绑定手机号后再关联服务相册')
    err.code = 403
    throw err
  }
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('相册不存在或已被删除')
    err.code = 404
    throw err
  }
  if (raw.userPhone && raw.userPhone !== phone) {
    const err = new Error('该服务相册已关联其他车主')
    err.code = 409
    throw err
  }
  if (!raw.userPhone) {
    raw.userPhone = phone
    raw.updatedAt = new Date().toISOString()
    map[albumId] = raw
    saveAlbumMap(map)
  }
  return mockFetchServiceAlbum(albumId)
}

async function mockFetchMerchantAlbumClaimQrcode(albumId) {
  await delay()
  const map = loadAlbumMap()
  if (!map[albumId]) {
    const err = new Error('档案不存在或已被删除')
    err.code = 404
    throw err
  }
  return {
    albumId,
    claimPath: `/pages/album/claim/index?albumId=${albumId}`,
    qrcodeAvailable: false,
    message: '演示模式：请车主打开认领页或复制路径测试',
  }
}

async function mockSwitchMerchantServiceAlbumTemplate(albumId, templateId) {
  await delay(280)
  const titles = MOCK_TEMPLATE_NODE_TITLES[templateId]
  const option = MOCK_TEMPLATE_OPTIONS.find((item) => item.id === templateId)
  if (!titles || !option) {
    const err = new Error('无效的相册模板')
    err.code = 400
    throw err
  }
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('档案不存在或已被删除')
    err.code = 404
    throw err
  }
  if (
    raw.status === SERVICE_ALBUM_STATUS.COMPLETED ||
    raw.status === SERVICE_ALBUM_STATUS.PUBLISHED
  ) {
    const err = new Error('已完工或审核中的相册不可切换模板')
    err.code = 409
    throw err
  }
  const now = new Date().toISOString()
  const next = {
    ...raw,
    templateId,
    templateName: option.name,
    updatedAt: now,
    nodes: (raw.nodes || buildEmptyStageNodes()).map((node, index) => ({
      ...node,
      title: titles[index] || node.title,
    })),
  }
  map[albumId] = next
  saveAlbumMap(map)
  return buildMerchantAlbumView(next)
}

async function mockRecognizeVehicleIntakeOcr(imageUrl) {
  const url = String(imageUrl || '').trim()
  if (!url) {
    const err = new Error('请先上传接车照片')
    err.status = 400
    throw err
  }
  return {
    plate: '浙A12345',
    plateDisplay: '浙A****5',
    vin: 'LGWEF4A58NF123456',
    recognized: ['plate', 'vin'],
    provider: 'mock',
  }
}

function buildMockPlanPartsContext(raw) {
  const { buildPlanAmountMismatchHint, sanitizePlanPartsDraft } = require('../backend/src/lib/plan-quote-parse')
  const planParts = sanitizePlanPartsDraft(raw.planParts || [])
  const amountCheck = buildPlanAmountMismatchHint(raw.planAmount, planParts)
  const stage3 = (raw.nodes || []).find((n) => n.id === 'stage_3')
  return {
    planParts,
    planPartsLocked: Boolean(raw.planPartsLockedAt),
    planPartsLockedAt: raw.planPartsLockedAt || '',
    planQuoteThumbs: (stage3 && stage3.images) || [],
    planAmount: raw.planAmount,
    amountMismatch: amountCheck.mismatch,
    amountMismatchHint: amountCheck.hint,
  }
}

async function mockFetchMerchantPlanParts(albumId) {
  await delay(120)
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('档案不存在')
    err.code = 404
    throw err
  }
  return buildMockPlanPartsContext(raw)
}

async function mockSaveMerchantPlanPartsDraft(albumId, payload) {
  await delay(180)
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('档案不存在')
    err.code = 404
    throw err
  }
  if (raw.planPartsLockedAt) {
    const err = new Error('方案配件目录已锁定，请先解锁后再修改')
    err.code = 409
    throw err
  }
  const { sanitizePlanPartsDraft } = require('../backend/src/lib/plan-quote-parse')
  raw.planParts = sanitizePlanPartsDraft(payload.planParts)
  raw.updatedAt = new Date().toISOString()
  map[albumId] = raw
  saveAlbumMap(map)
  return buildMockPlanPartsContext(raw)
}

async function mockLockMerchantPlanParts(albumId) {
  await delay(180)
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('档案不存在')
    err.code = 404
    throw err
  }
  const { sanitizePlanPartsDraft } = require('../backend/src/lib/plan-quote-parse')
  raw.planParts = sanitizePlanPartsDraft(raw.planParts || []).map((row) => ({
    ...row,
    status: 'confirmed',
  }))
  raw.planPartsLockedAt = new Date().toISOString()
  map[albumId] = raw
  saveAlbumMap(map)
  return buildMockPlanPartsContext(raw)
}

async function mockUnlockMerchantPlanParts(albumId) {
  await delay(120)
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('档案不存在')
    err.code = 404
    throw err
  }
  raw.planPartsLockedAt = ''
  raw.planParts = (raw.planParts || []).map((row) => ({ ...row, status: 'draft' }))
  map[albumId] = raw
  saveAlbumMap(map)
  return buildMockPlanPartsContext(raw)
}

async function mockRunMerchantPlanQuoteOcr(albumId) {
  await delay(500)
  const map = loadAlbumMap()
  const raw = map[albumId]
  if (!raw) {
    const err = new Error('档案不存在')
    err.code = 404
    throw err
  }
  raw.planParts = [
    {
      planPartId: 'plan_headlight',
      name: '左前大灯总成',
      partType: PART_TYPE.BRAND,
      partBrand: '海拉',
      partCode: '',
      qty: 1,
      unitPrice: 1680,
      status: 'confirmed',
    },
  ]
  raw.parts = [
    {
      partId: 'part_plan_headlight',
      planPartId: 'plan_headlight',
      linkKey: 'plan_headlight',
      partName: '左前大灯总成',
      partType: PART_TYPE.BRAND,
      partBrand: '海拉',
      partCode: '',
      photos: [],
      source: 'plan_linked',
      qty: 1,
    },
  ]
  map[albumId] = raw
  saveAlbumMap(map)
  return {
    ...buildMockPlanPartsContext(raw),
    parts: raw.parts || [],
    ocrProvider: 'mock',
    parseMethod: 'mock',
    parseHint: '演示数据，请到配件/材料环节核对并上传凭证。',
    textPreview: '左前大灯总成 品牌件 ×1 1680元',
  }
}

module.exports = {
  mockFetchAlbumClaimPreview,
  mockClaimServiceAlbum,
  mockFetchMerchantAlbumClaimQrcode,
  mockFetchUserServiceAlbums,
  countMockUserAlbumsForVehicle,
  mockFetchServiceAlbum,
  mockSubmitPartConfirm,
  mockSubmitServiceAlbumAuthorization,
  mockFetchUserAuthorizations,
  mockWithdrawAuthorization,
  mockCountPendingConfirm,
  mockCountPendingAuth,
  mockFetchMerchantServiceAlbumList,
  mockFetchMerchantServiceAlbum,
  mockCreateMerchantServiceAlbum,
  mockSaveMerchantServiceAlbum,
  mockCompleteMerchantServiceAlbum,
  mockFetchMerchantAlbumStats,
  mockFetchMerchantAlbumGeoPreview,
  mockCreateMerchantColdStartPreview,
  mockSubmitMerchantPublicCase,
  mockRecordAlbumShare,
  mockFetchSharedAlbum,
  mockSwitchMerchantServiceAlbumTemplate,
  mockRecognizeVehicleIntakeOcr,
  mockFetchMerchantPlanParts,
  mockSaveMerchantPlanPartsDraft,
  mockLockMerchantPlanParts,
  mockUnlockMerchantPlanParts,
  mockRunMerchantPlanQuoteOcr,
  MOCK_ALBUMS,
}
