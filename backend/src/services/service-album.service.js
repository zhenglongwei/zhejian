const { prisma } = require('../lib/prisma')
const { newId, formatVehicle, maskPhone, toIso } = require('../lib/ids')
const { albumToNodeView } = require('./desensitize.constants')
const {
  resolvePlanAmount,
  buildPrivateAlbumPrice,
  buildPublicCasePrice,
  normalizePlanAmountPayload,
  formatPlanAmountLabel,
} = require('../utils/album-price')
const {
  SERVICE_ALBUM_STATUS,
  DEFAULT_STAGE_NODES,
  PUBLIC_CASE_STATUS,
} = require('../constants/v2')
const {
  resolveAlbumNodeTemplate,
  buildAlbumNodesFromTemplate,
  getTemplateNodeMetaMap,
  listServiceAlbumTemplateOptions,
  getAlbumTemplateById,
} = require('../constants/service-album-node-template')
const { applyTemplateStageMeta } = require('../constants/service-album-template-stage-meta')
const { buildAuthorizeTaskId, BIZ_TYPE } = require('./desensitize.constants')
const {
  assertPersistentImageUrl,
  rewriteMediaUrlForCurrentBase,
} = require('../lib/media-storage')
const { watermarkAlbumImageUrl } = require('../lib/album-watermark')
const { sanitizePlanPartsDraft } = require('../lib/plan-quote-parse')
const { resolvePublicCaseMediaUrl } = require('../lib/media-url')
const { config } = require('../config')
const { getWxaCodeUnlimited } = require('../lib/wechat')

const { filterUserAlbumsByTab } = require('../utils/service-album-tab-filter')
const { buildAlbumSummaryFields } = require('../utils/album-summary')
const { albumMatchesUserVehicle } = require('../utils/album-vehicle-match')
const { detectAlbumSaveChanges } = require('../utils/album-save-notify')
const { maskPlate } = require('../utils/plate-mask')
const { normalizePlate, normalizeVin } = require('./vehicle-intake-ocr.service')
const { assessGeoEvidence } = require('../utils/case-geo-quality')
const {
  hydrateEvidenceItems,
  sanitizeEvidenceItemsPayload,
  mergeEvidenceIntoNodes,
  countDocumentEvidence,
  buildValidPlanPartIdSet,
} = require('../utils/album-evidence-items')

function normalizeVehicleJson(vehicle = {}) {
  if (!vehicle || typeof vehicle !== 'object') return {}
  const brand = String(vehicle.brand || '').trim()
  const series = String(vehicle.series || '').trim()
  const plate = normalizePlate(vehicle.plate || vehicle.plateNumber || '')
  const vin = normalizeVin(vehicle.vin || '')
  let plateDisplay = String(vehicle.plateDisplay || '').trim()
  if (plate) {
    plateDisplay = maskPlate(plate)
  }
  const out = {}
  if (brand) out.brand = brand
  if (series) out.series = series
  if (plate) {
    out.plate = plate
    out.plateDisplay = plateDisplay
  } else if (plateDisplay) {
    out.plateDisplay = plateDisplay
  }
  if (vin) out.vin = vin
  const modelYear = String(vehicle.modelYear || vehicle.model_year || '').trim()
  if (modelYear) out.modelYear = modelYear
  return out
}

/** 用户端不返回完整车牌/VIN，仅脱敏展示字段 */
function sanitizeUserVehicle(vehicleJson = {}) {
  const normalized = normalizeVehicleJson(vehicleJson)
  const out = { ...normalized }
  delete out.plate
  delete out.vin
  return out
}

const MERCHANT_TAB_STATUS = {
  all: null,
  active: [
    SERVICE_ALBUM_STATUS.DRAFT,
    'in_progress',
    'pending_delivery',
    'pending_part_confirm',
  ],
  done: [SERVICE_ALBUM_STATUS.COMPLETED],
  pending_auth: ['pending_authorization', 'pending_review', 'published'],
}

function countImages(nodes) {
  return (nodes || []).reduce((sum, n) => sum + (n.images || []).length, 0)
}

function resolvePublicCaseStatus(album) {
  if (album.publicCaseStatus === 'user_rejected') return 'user_rejected'
  if (album.publicCase?.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED) return 'public_approved'
  if (album.publicCase?.status === PUBLIC_CASE_STATUS.PENDING_REVIEW) return 'pending_review'
  if (album.authorization?.status === 'authorized') return 'pending_review'
  return album.publicCaseStatus || 'private'
}

function mapNodesForView(album) {
  const nodeViews = albumToNodeView(album)
  const templateMeta = getTemplateNodeMetaMap(album.templateId)
  return nodeViews.map((node) => {
    const meta = templateMeta[node.id] || {}
    const requiredLevel = meta.requiredLevel || ''
    const stageMeta = applyTemplateStageMeta(album.templateId, node.id, {})
    return {
      id: node.id,
      title: node.title,
      status: node.status,
      note: node.note || '',
      comparePairRows: Array.isArray(node.comparePairRows) ? node.comparePairRows : [],
      images: (node.images || []).map((url) => rewriteMediaUrlForCurrentBase(url)),
      updatedAt: node.updatedAt ? toIso(node.updatedAt) : '',
      description: stageMeta.description || '',
      photoTips: stageMeta.photoTips || '',
      compareGuidance: stageMeta.compareGuidance || '',
      requiredLevelLabel:
        requiredLevel === 'required'
          ? '必拍'
          : requiredLevel === 'recommended'
            ? '建议拍摄'
            : '',
      requiredLevelVariant: requiredLevel === 'required' ? 'danger' : 'info',
    }
  })
}

function resolveEvidenceItemsForAlbum(album, nodes) {
  const saved = Array.isArray(album.evidenceItemsJson) ? album.evidenceItemsJson : []
  return hydrateEvidenceItems({
    templateId: album.templateId,
    savedItems: saved,
    nodes,
  })
}

function buildListCoverUrl(album) {
  const images = album.images || []
  if (images.length) {
    const url =
      images[0].rawUrl || images[0].url || images[0].imageUrl || ''
    return rewriteMediaUrlForCurrentBase(url)
  }
  const nodes = mapNodesForView(album)
  for (const node of nodes) {
    if (node.images && node.images[0]) return node.images[0]
  }
  return ''
}

function buildListStageProgress(album) {
  const nodes = mapNodesForView(album)
  const nodeById = {}
  nodes.forEach((node) => {
    if (node && node.id) nodeById[node.id] = node
  })
  return DEFAULT_STAGE_NODES.map((stage) => {
    const node = nodeById[stage.nodeId]
    const filled =
      Boolean(node) &&
      ((node.images || []).length > 0 || String(node.note || '').trim())
    return {
      id: stage.nodeId,
      title: stage.title,
      filled,
    }
  })
}

function buildStoreBlock(album) {
  return {
    id: album.storeId || '',
    name: album.storeName || '—',
    phone: '',
    address: '—',
    city: '杭州',
  }
}

function buildAlbumView(album) {
  const nodes = mapNodesForView(album)
  const imageCount = album.imageCount || countImages(nodes)
  const store = buildStoreBlock(album)
  const vehicle = sanitizeUserVehicle(album.vehicleJson || {})
  const vehicleDisplay = formatVehicle(vehicle)
  const publicCaseStatus = resolvePublicCaseStatus(album)
  const privatePrice = buildPrivateAlbumPrice(album)
  const planAmount = privatePrice.planAmount

  const view = {
    albumId: album.id,
    serviceName: album.serviceName || '—',
    store,
    status: album.status,
    complexityLevel: album.complexityLevel || 'L1',
    vehicleDisplay,
    vehicle,
    imageCount,
    storeNote: album.storeNote || '',
    nodes,
    evidenceItems: resolveEvidenceItemsForAlbum(album, nodes),
    pendingConfirms: album.pendingConfirmsJson || [],
    pendingCount: (album.pendingConfirmsJson || []).length,
    publicCaseStatus,
    publicCaseId: album.publicCase?.id || '',
    publicCaseTitle: album.publicCase?.title || '',
    publicCaseCover: resolvePublicCaseMediaUrl(album.publicCase?.coverImage || ''),
    priceMode: privatePrice.priceMode,
    amount: privatePrice.amount,
    planAmount,
    minAmount: privatePrice.minAmount,
    maxAmount: privatePrice.maxAmount,
    createdAt: toIso(album.createdAt),
    updatedAt: toIso(album.updatedAt),
    completedAt: album.completedAt ? toIso(album.completedAt) : '',
    templateId: album.templateId || '',
    templateName: album.templateName || '',
  }

  const summaryFields = buildAlbumSummaryFields(album, {
    ...view,
    formatPlanAmountLabel,
  }, privatePrice)

  const { buildPlanPartsContext } = require('./album-plan-parts.service')
  const planCtx = buildPlanPartsContext(album)

  return {
    ...view,
    ...summaryFields,
    planParts: planCtx.planParts,
    planPartsLocked: planCtx.planPartsLocked,
    planPartsLockedAt: planCtx.planPartsLockedAt,
  }
}

function buildServiceAlbumCompleteness(album, nodes) {
  const templateMeta = getTemplateNodeMetaMap(album.templateId)
  const list = nodes || []
  const total = list.length
  const filled = list.filter(
    (n) => (n.images || []).length > 0 || String(n.note || '').trim()
  ).length
  const requiredKeys = Object.keys(templateMeta).filter(
    (key) => templateMeta[key].requiredLevel === 'required'
  )
  const requiredFilled = requiredKeys.filter((key) => {
    const node = list.find((n) => n.id === key)
    if (!node) return false
    return (node.images || []).length > 0 || String(node.note || '').trim()
  }).length
  const privatePrice = buildPrivateAlbumPrice(album)
  const planAmount = privatePrice.planAmount
  const geoResult = assessGeoEvidence({
    nodes: list,
    coldStart: true,
    serviceName: album.serviceName,
    planAmount,
    storeNote: album.storeNote,
    imageCount: album.imageCount || countImages(list),
  })
  return {
    filledStages: filled,
    totalStages: total,
    requiredStages: requiredKeys.length,
    requiredFilled,
    summaryText:
      requiredKeys.length > 0
        ? `已上传 ${filled}/${total} 个阶段，必拍 ${requiredFilled}/${requiredKeys.length}`
        : `已上传 ${filled}/${total} 个阶段`,
    geoEvidence: {
      level: geoResult.level,
      score: geoResult.score,
      summaryText: geoResult.summaryText,
      missingCount: geoResult.missingFields.length,
      missingFields: geoResult.missingFields,
    },
  }
}

function sanitizePartVerifyGuidePayload(payload = {}, existing = {}) {
  const informed =
    payload.partVerifyGuideInformed != null
      ? Boolean(payload.partVerifyGuideInformed)
      : Boolean(existing.partVerifyGuideInformed)
  const textRaw =
    payload.partVerifyGuideText != null
      ? String(payload.partVerifyGuideText || '')
      : String(existing.partVerifyGuideText || '')
  const { MAX_PART_VERIFY_GUIDE_TEXT } = require('../constants/album-review')
  return {
    partVerifyGuideText: informed ? '' : textRaw.trim().slice(0, MAX_PART_VERIFY_GUIDE_TEXT),
    partVerifyGuideInformed: informed,
  }
}

function buildMerchantView(album) {
  const nodes = mapNodesForView(album)
  const evidenceItems = resolveEvidenceItemsForAlbum(album, nodes)
  const imageCount = album.imageCount || countImages(nodes)
  const privatePrice = buildPrivateAlbumPrice(album)
  const planAmount = privatePrice.planAmount
  const publicCaseStatus = resolvePublicCaseStatus(album)
  const hasOwner = albumHasOwner(album)
  const { buildPlanPartsContext } = require('./album-plan-parts.service')
  const planCtx = buildPlanPartsContext(album)
  const isCompleted =
    album.status === SERVICE_ALBUM_STATUS.COMPLETED ||
    album.status === SERVICE_ALBUM_STATUS.PUBLISHED ||
    album.status === 'published'
  const canSubmitColdStartPublicCase = false
  return {
    albumId: album.id,
    storeId: album.storeId,
    serviceId: album.serviceId || '',
    serviceName: album.serviceName || '',
    complexityLevel: album.complexityLevel || 'L1',
    status: album.status,
    userPhone: album.userPhone || '',
    userPhoneDisplay: maskPhone(album.userPhone || ''),
    hasOwner,
    vehicle: normalizeVehicleJson(album.vehicleJson || {}),
    vehicleDisplay: formatVehicle(album.vehicleJson),
    storeName: album.storeName || '—',
    storeNote: album.storeNote || '',
    templateId: album.templateId || '',
    templateName: album.templateName || '',
    nodes,
    evidenceItems,
    parts: album.partsJson || [],
    planAmount,
    planMinAmount: planAmount,
    planMaxAmount: planAmount,
    priceMode: privatePrice.priceMode,
    amount: privatePrice.amount,
    imageCount,
    publicCaseStatus,
    publicCaseId: album.publicCase?.id || '',
    canSubmitColdStartPublicCase,
    invitePath: `/pages/album/detail/index?albumId=${album.id}&from=merchant_share`,
    claimPath: `/pages/album/claim/index?albumId=${album.id}`,
    createdAt: toIso(album.createdAt),
    updatedAt: toIso(album.updatedAt),
    completedAt: album.completedAt ? toIso(album.completedAt) : '',
    completeness: buildServiceAlbumCompleteness(album, nodes),
    planParts: planCtx.planParts,
    planPartsLocked: planCtx.planPartsLocked,
    planPartsLockedAt: planCtx.planPartsLockedAt,
    planQuoteThumbs: planCtx.planQuoteThumbs,
    amountMismatch: planCtx.amountMismatch,
    amountMismatchHint: planCtx.amountMismatchHint,
    partVerifyGuideText: album.partVerifyGuideText || '',
    partVerifyGuideInformed: Boolean(album.partVerifyGuideInformed),
  }
}

function filterByTab(albums, tab, map) {
  const statuses = map[tab || 'all']
  if (!statuses) return albums
  return albums.filter((a) => statuses.includes(a.status))
}

async function loadAlbum(albumId) {
  return prisma.album.findUnique({
    where: { id: albumId },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
      authorization: true,
      publicCase: true,
    },
  })
}

function canAccessMerchantAlbum(album, storeId, merchantId) {
  if (!album) return false
  if (merchantId && album.merchantId === merchantId) return true
  if (storeId && album.storeId === storeId) return true
  return false
}

function assertMerchantAlbum(album, storeId, merchantId) {
  if (!canAccessMerchantAlbum(album, storeId, merchantId)) {
    const err = new Error('档案不存在或已被删除')
    err.status = 404
    throw err
  }
}

async function syncAlbumNodes(albumId, nodesPayload = [], options = {}) {
  const nodes = nodesPayload.length ? nodesPayload : DEFAULT_STAGE_NODES.map((n) => ({
    id: n.nodeId,
    title: n.title,
    status: 'pending',
    note: '',
    images: [],
  }))
  const albumContext = options.album || null
  const previousUrls = options.previousImageUrls || new Set()

  await prisma.albumNode.deleteMany({ where: { albumId } })
  await prisma.albumImage.deleteMany({ where: { albumId } })

  const imageRows = []
  let imageCount = 0

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    const nodeId = node.id || node.nodeId || `stage_${i + 1}`
    const nodeTitle = node.title || ''
    await prisma.albumNode.create({
      data: {
        albumId,
        nodeId,
        title: nodeTitle,
        sortOrder: i,
        status: node.status || 'pending',
        note: node.note || '',
        comparePairRows: Array.isArray(node.comparePairRows) ? node.comparePairRows : [],
        updatedAt: node.updatedAt ? new Date(node.updatedAt) : null,
      },
    })
    for (let idx = 0; idx < (node.images || []).length; idx += 1) {
      const url = node.images[idx]
      if (!url) continue
      let rawUrl = assertPersistentImageUrl(
        typeof url === 'string' ? url : url.rawUrl || url.url || ''
      )
      if (!rawUrl) continue
      if (albumContext) {
        rawUrl = await watermarkAlbumImageUrl(rawUrl, {
          album: albumContext,
          nodeTitle,
          previousUrls,
        })
      }
      imageRows.push({
        id: `img_${albumId}_${nodeId}_${idx}`,
        albumId,
        nodeId,
        idx,
        rawUrl,
      })
      imageCount += 1
    }
  }

  if (imageRows.length) {
    await prisma.albumImage.createMany({ data: imageRows })
  }

  return imageCount
}

function buildUserAlbumWhere(userId, phone) {
  return phone ? { OR: [{ userId }, { userPhone: phone }] } : { userId }
}

async function resolveUserVehicleForFilter(userId, vehicleId) {
  const id = String(vehicleId || '').trim()
  if (!id) return null
  const row = await prisma.userVehicle.findFirst({
    where: { id, userId, deletedAt: null },
  })
  if (!row) {
    const err = new Error('车辆不存在')
    err.status = 404
    throw err
  }
  return row
}

function mapUserServiceAlbumListItem(album) {
  const view = buildAlbumView(album)
  const parts = Array.isArray(album.partsJson) ? album.partsJson : []
  return {
    id: view.albumId,
    albumId: view.albumId,
    serviceName: view.serviceName,
    storeName: view.store.name,
    storeId: view.store.id,
    vehicleDisplay: view.vehicleDisplay,
    status: view.status,
    imageCount: view.imageCount,
    pendingCount: view.pendingCount,
    publicCaseStatus: view.publicCaseStatus,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    isPublic: view.publicCaseStatus === 'public_approved',
    coverUrl: buildListCoverUrl(album),
    stageProgress: buildListStageProgress(album),
    deliverDateText: view.deliverDateText,
    summaryLine: view.summaryLine,
    summaryRows: view.summaryRows,
    partsSummary: view.partsSummary,
    partCount: parts.length,
    showPartVerifyLink: parts.length > 0,
  }
}

async function countUserAlbumsForVehicle(userId, vehicleRow) {
  if (!vehicleRow) return 0
  const counts = await countUserAlbumsForVehicleRows(userId, [vehicleRow])
  return counts[0] || 0
}

async function countUserAlbumsForVehicleRows(userId, vehicleRows = []) {
  if (!vehicleRows.length) return []
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } })
  const phone = user?.phone || ''
  const albums = await prisma.album.findMany({
    where: {
      ...buildUserAlbumWhere(userId, phone),
      imageCount: { gt: 0 },
    },
    select: { vehicleJson: true },
  })
  return vehicleRows.map((vehicleRow) =>
    albums.filter((album) => albumMatchesUserVehicle(album.vehicleJson, vehicleRow)).length,
  )
}

async function countUserServiceAlbumBindings(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const phone = user?.phone || ''
  const count = await prisma.album.count({
    where: {
      ...buildUserAlbumWhere(userId, phone),
      imageCount: { gt: 0 },
    },
  })
  return count
}

/** 我的页摘要：轻量查询最近 N 条私密相册（不含 nodes/images） */
async function listUserRecentServiceAlbums(userId, limit = 3) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const phone = user?.phone || ''

  const albums = await prisma.album.findMany({
    where: {
      ...buildUserAlbumWhere(userId, phone),
      imageCount: { gt: 0 },
      publicCaseStatus: { not: 'public_approved' },
    },
    select: {
      id: true,
      serviceName: true,
      storeName: true,
      storeId: true,
      vehicleJson: true,
      status: true,
      imageCount: true,
      publicCaseStatus: true,
      pendingConfirmsJson: true,
      createdAt: true,
      updatedAt: true,
      authorization: { select: { status: true } },
      publicCase: { select: { status: true } },
      images: {
        take: 1,
        orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }],
        select: { rawUrl: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.max(1, Math.min(Number(limit) || 3, 5)),
  })

  return albums.map((album) => {
    const vehicle = album.vehicleJson || {}
    const publicCaseStatus = resolvePublicCaseStatus(album)
    return {
      id: album.id,
      albumId: album.id,
      serviceName: album.serviceName || '—',
      storeName: album.storeName || '',
      storeId: album.storeId || '',
      vehicleDisplay: formatVehicle(vehicle),
      status: album.status,
      imageCount: album.imageCount || 0,
      pendingCount: Array.isArray(album.pendingConfirmsJson)
        ? album.pendingConfirmsJson.length
        : 0,
      publicCaseStatus,
      createdAt: toIso(album.createdAt),
      updatedAt: toIso(album.updatedAt),
      isPublic: publicCaseStatus === 'public_approved',
      coverUrl: buildListCoverUrl(album),
    }
  })
}

async function listUserServiceAlbums(userId, options = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const phone = user?.phone || ''
  const where = buildUserAlbumWhere(userId, phone)

  let albums = await prisma.album.findMany({
    where,
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
      authorization: true,
      publicCase: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  albums = filterUserAlbumsByTab(albums, options.tab, resolvePublicCaseStatus)

  const vehicleFilter = await resolveUserVehicleForFilter(userId, options.vehicleId)
  if (vehicleFilter) {
    albums = albums.filter((album) =>
      albumMatchesUserVehicle(album.vehicleJson, vehicleFilter),
    )
  }

  const list = albums
    .map((album) => mapUserServiceAlbumListItem(album))
    .filter(
      (item) =>
        item.imageCount > 0 ||
        item.status === 'completed' ||
        item.status === 'published',
    )

  const { getPartVerifySummariesForUser } = require('./album-part-verification.service')
  const summaries = await getPartVerifySummariesForUser(
    userId,
    list.map((item) => item.albumId),
  )
  return list.map((item) => ({
    ...item,
    partVerifySummary: summaries[item.albumId] || null,
  }))
}

async function getUserServiceAlbum(albumId, userId) {
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在或已被删除')
    err.status = 404
    throw err
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const phone = user?.phone || ''
  const allowed =
    album.userId === userId || (phone && album.userPhone === phone)
  if (!allowed) {
    const err = new Error(
      album.userPhone
        ? '仅关联车主可查看，请确认登录手机号与门店登记一致'
        : '你无权查看该服务相册。'
    )
    err.status = 403
    throw err
  }
  return buildAlbumView(album)
}

async function listMerchantServiceAlbums(storeId, options = {}, merchantId = '') {
  const where = merchantId ? { merchantId } : { storeId }
  let albums = await prisma.album.findMany({
    where,
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
    },
    orderBy: { updatedAt: 'desc' },
  })
  albums = filterByTab(albums, options.tab, MERCHANT_TAB_STATUS)
  return albums.map((album) => {
    const view = buildMerchantView(album)
    return {
      albumId: view.albumId,
      serviceName: view.serviceName,
      storeName: view.storeName,
      vehicleDisplay: view.vehicleDisplay,
      status: view.status,
      imageCount: view.imageCount,
      userPhone: view.userPhone,
      userPhoneDisplay: view.userPhoneDisplay,
      updatedAt: view.updatedAt,
      coverUrl: buildListCoverUrl(album),
    }
  })
}

async function getMerchantServiceAlbum(albumId, storeId, merchantId = '') {
  const album = await loadAlbum(albumId)
  assertMerchantAlbum(album, storeId, merchantId)
  return buildMerchantView(album)
}

function albumHasOwner(album) {
  return (
    Boolean(String(album?.userId || '').trim()) ||
    Boolean(String(album?.userPhone || '').trim())
  )
}

function assertAlbumHasOwnerPhone(album) {
  if (config.merchantOwnerPhoneTest) return
  if (albumHasOwner(album)) return
  const err = new Error('请先请车主扫码关联手机号后再继续')
  err.status = 409
  err.code = 100009
  throw err
}

function assertMerchantCannotSetOwnerPhone(payload = {}) {
  if (config.merchantOwnerPhoneTest) return
  if (payload.userPhone == null || payload.userPhone === '') return
  const phone = String(payload.userPhone || '').trim()
  if (phone) {
    const err = new Error('车主手机号须由车主扫码关联，商家不可代填')
    err.status = 400
    throw err
  }
}

async function resolveServiceItemIdForAlbum(payload = {}) {
  const direct = String(payload.serviceItemId || payload.service_item_id || '').trim()
  if (direct) return direct
  const serviceId = String(payload.serviceId || payload.service_id || '').trim()
  if (!serviceId) return ''
  const plan = await prisma.merchantServicePlan.findUnique({
    where: { id: serviceId },
    select: { serviceItemId: true },
  })
  return plan?.serviceItemId || ''
}

async function createMerchantServiceAlbum(merchantId, storeId, payload = {}) {
  assertMerchantCannotSetOwnerPhone(payload)
  const normalized = normalizePlanAmountPayload(payload)
  const planAmount = resolvePlanAmount(normalized)
  const serviceName = payload.serviceName || '服务留档'
  const serviceItemId = await resolveServiceItemIdForAlbum(payload)
  const template = resolveAlbumNodeTemplate({ serviceItemId, serviceName })
  const albumId = newId('alb_svc')
  const album = await prisma.album.create({
    data: {
      id: albumId,
      merchantId,
      storeId,
      storeName: payload.storeName || payload.store_name || '门店',
      serviceId: payload.serviceId || '',
      serviceName,
      userPhone: payload.userPhone || '',
      complexityLevel: payload.complexityLevel || 'L1',
      vehicleJson: normalizeVehicleJson(payload.vehicle || {}),
      priceMode: planAmount != null ? 'fixed' : '',
      minAmount: planAmount,
      maxAmount: planAmount,
      status: SERVICE_ALBUM_STATUS.DRAFT,
      templateId: template.templateId || '',
      templateName: template.templateName || '',
      imageCount: 0,
      nodes: {
        create: buildAlbumNodesFromTemplate(template),
      },
    },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
    },
  })
  return buildMerchantView(album)
}

async function resolveOwnerPhoneUpdate(existing, payload) {
  if (payload.userPhone === undefined) return {}
  const userPhone = String(payload.userPhone || '').trim()
  const previous = String(existing.userPhone || '').trim()
  if (userPhone === previous) {
    return { userPhone: previous }
  }
  if (!userPhone) {
    if (previous) {
      const err = new Error('已关联车主手机号不可清空')
      err.status = 400
      throw err
    }
    return { userPhone: '', userId: '' }
  }
  const user = await prisma.user.findFirst({ where: { phone: userPhone } })
  return {
    userPhone,
    userId: user ? user.id : '',
  }
}

async function saveMerchantServiceAlbum(albumId, storeId, payload = {}, merchantId = '') {
  const existing = await loadAlbum(albumId)
  assertMerchantAlbum(existing, storeId, merchantId)
  assertMerchantCannotSetOwnerPhone(payload)

  let imageCount = existing.imageCount
  let evidenceItemsJson = Array.isArray(existing.evidenceItemsJson)
    ? existing.evidenceItemsJson
    : []
  if (payload.evidenceItems != null) {
    evidenceItemsJson = sanitizeEvidenceItemsPayload(payload.evidenceItems, {
      validPlanPartIds: buildValidPlanPartIdSet(
        payload.planParts != null ? payload.planParts : existing.planPartsJson,
        payload.parts != null ? payload.parts : existing.partsJson,
      ),
    })
  }
  if (payload.nodes) {
    const mergedNodes = mergeEvidenceIntoNodes(payload.nodes, evidenceItemsJson)
    const previousImageUrls = new Set(
      (existing.images || []).map((img) => rewriteMediaUrlForCurrentBase(img.rawUrl))
    )
    imageCount = await syncAlbumNodes(albumId, mergedNodes, {
      album: existing,
      previousImageUrls,
    })
    const { syncPlanQuoteImageIds } = require('./album-plan-parts.service')
    await syncPlanQuoteImageIds(albumId)
  }

  let status = payload.status || existing.status
  if (
    status === SERVICE_ALBUM_STATUS.DRAFT &&
    imageCount > 0
  ) {
    status = 'in_progress'
  }

  const normalized = normalizePlanAmountPayload(payload)
  const planAmount = resolvePlanAmount({
    ...existing,
    ...normalized,
  })
  const planPartsUpdate =
    payload.planParts != null
      ? sanitizePlanPartsDraft(payload.planParts)
      : undefined
  const ownerUpdate = config.merchantOwnerPhoneTest
    ? await resolveOwnerPhoneUpdate(existing, payload)
    : {}
  const partVerifyGuide = sanitizePartVerifyGuidePayload(payload, existing)
  const album = await prisma.album.update({
    where: { id: albumId },
    data: {
      serviceName: payload.serviceName ?? existing.serviceName,
      serviceId: payload.serviceId ?? existing.serviceId,
      vehicleJson: normalizeVehicleJson(payload.vehicle ?? existing.vehicleJson),
      storeNote: payload.storeNote ?? existing.storeNote,
      complexityLevel: payload.complexityLevel ?? existing.complexityLevel,
      partsJson: payload.parts ?? existing.partsJson,
      planPartsJson: planPartsUpdate ?? existing.planPartsJson,
      evidenceItemsJson,
      ...partVerifyGuide,
      priceMode: planAmount != null ? 'fixed' : existing.priceMode,
      minAmount: planAmount != null ? planAmount : existing.minAmount,
      maxAmount: planAmount != null ? planAmount : existing.maxAmount,
      status,
      imageCount,
      ...ownerUpdate,
    },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
    },
  })

  const saveChange = detectAlbumSaveChanges(existing, payload, imageCount)
  if (saveChange) {
    const { notifyAlbumNodeUpdated } = require('./notification.service')
    notifyAlbumNodeUpdated(album, saveChange).catch((e) => {
      console.warn('[notification] album node updated', e && e.message)
    })
  }

  return buildMerchantView(album)
}

async function completeMerchantServiceAlbum(albumId, storeId, merchantId = '') {
  const existing = await loadAlbum(albumId)
  assertMerchantAlbum(existing, storeId, merchantId)
  assertAlbumHasOwnerPhone(existing)
  const imageCount = existing.imageCount || (existing.images || []).length
  if (imageCount < 1) {
    const err = new Error('请至少上传一张过程图')
    err.status = 409
    throw err
  }
  const album = await prisma.album.update({
    where: { id: albumId },
    data: {
      status: SERVICE_ALBUM_STATUS.COMPLETED,
      completedAt: new Date(),
    },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
    },
  })
  const { notifyAlbumCompleted } = require('./notification.service')
  notifyAlbumCompleted(album).catch((e) => {
    console.warn('[notification] album completed', e && e.message)
  })
  return buildMerchantView(album)
}

async function fetchMerchantAlbumStats(storeId, merchantId = '') {
  const where = merchantId ? { merchantId } : { storeId }
  const albums = await prisma.album.findMany({
    where,
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      publicCase: true,
    },
  })
  const active = filterByTab(albums, 'active', MERCHANT_TAB_STATUS).length
  const pendingAuth = filterByTab(albums, 'pending_auth', MERCHANT_TAB_STATUS)
    .filter((a) => a.status === SERVICE_ALBUM_STATUS.COMPLETED).length
  const pendingUpload = albums.filter(
    (a) =>
      [SERVICE_ALBUM_STATUS.DRAFT, 'in_progress'].includes(a.status) &&
      a.imageCount < 2
  ).length
  let geoEvidenceBlocked = 0
  for (const album of albums) {
    const hasOwner =
      Boolean(String(album.userId || '').trim()) ||
      Boolean(String(album.userPhone || '').trim())
    const isCompleted =
      album.status === SERVICE_ALBUM_STATUS.COMPLETED ||
      album.status === SERVICE_ALBUM_STATUS.PUBLISHED ||
      album.status === 'published'
    const publicCaseStatus = resolvePublicCaseStatus(album)
    if (!isCompleted || hasOwner || publicCaseStatus !== 'private') continue
    const nodes = mapNodesForView(album)
    const completeness = buildServiceAlbumCompleteness(album, nodes)
    if (completeness.geoEvidence && completeness.geoEvidence.level === 'block') {
      geoEvidenceBlocked += 1
    }
  }
  return { active, pendingAuth, pendingUpload, geoEvidenceBlocked, total: albums.length }
}

async function submitServiceAlbumAuthorization(albumId, userId, payload = {}) {
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const phone = user?.phone || ''
  const allowed =
    album.userId === userId || (phone && album.userPhone === phone)
  if (!allowed) {
    const err = new Error('无权操作该相册')
    err.status = 403
    throw err
  }

  const agreed = payload.agreed !== false
  const tier = payload.tier || 'named'
  const status = agreed ? 'authorized' : 'user_rejected'
  const publicCaseStatus = agreed ? 'pending_review' : 'user_rejected'

  await prisma.albumAuthorization.upsert({
    where: { albumId },
    create: { albumId, agreed, status, tier },
    update: { agreed, status, tier },
  })
  await prisma.album.update({
    where: { id: albumId },
    data: {
      publicCaseStatus,
      authorizationTier: agreed ? tier : 'private',
      userId: album.userId || userId,
      userPhone: album.userPhone || phone,
    },
  })
  const { notifyAuthorizationSubmitted } = require('./notification.service')
  notifyAuthorizationSubmitted(albumId, agreed).catch((e) => {
    console.warn('[notification] authorization', e && e.message)
  })
  return { publicCaseStatus }
}

async function fetchUserAuthorizations(userId) {
  const albums = await listUserServiceAlbums(userId, { tab: 'all' })
  const ids = albums.map((a) => a.albumId)
  const auths = await prisma.albumAuthorization.findMany({
    where: { albumId: { in: ids } },
  })
  const authMap = Object.fromEntries(auths.map((a) => [a.albumId, a]))

  return albums
    .map((item) => {
      const auth = authMap[item.albumId]
      const needsAuthorization =
        item.status === 'completed' &&
        item.publicCaseStatus === 'private' &&
        !auth
      if (!auth && item.publicCaseStatus === 'private' && !needsAuthorization) return null
      const authStatus =
        auth?.status === 'user_rejected'
          ? 'rejected'
          : item.publicCaseStatus === 'public_approved'
            ? 'approved'
            : auth?.status === 'authorized'
              ? 'pending_review'
              : 'none'
      return {
        ...item,
        authStatus,
        reviewStatus:
          item.publicCaseStatus === 'public_approved'
            ? 'approved'
            : item.publicCaseStatus === 'pending_review'
              ? 'pending'
              : item.publicCaseStatus === 'user_rejected'
                ? 'rejected'
                : 'none',
        canWithdraw: ['pending_review', 'public_approved'].includes(item.publicCaseStatus),
        needsAuthorization,
      }
    })
    .filter(Boolean)
}

async function withdrawAuthorization(albumId, userId) {
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  await prisma.albumAuthorization.deleteMany({ where: { albumId } })
  await prisma.publicCase.deleteMany({ where: { albumId } })
  await prisma.desensitizeTask.updateMany({
    where: {
      taskId: buildAuthorizeTaskId(albumId),
      bizType: BIZ_TYPE.SERVICE_AUTHORIZE,
    },
    data: {
      maskingConfirmed: false,
      maskingConfirmedAt: null,
    },
  })
  await prisma.album.update({
    where: { id: albumId },
    data: {
      publicCaseStatus: 'private',
      authorizationTier: 'private',
      status: SERVICE_ALBUM_STATUS.COMPLETED,
    },
  })
  const { notifyAuthorizationWithdrawn } = require('./notification.service')
  notifyAuthorizationWithdrawn(albumId).catch((e) => {
    console.warn('[notification] withdraw authorization', e && e.message)
  })
  return { ok: true }
}

/** Phase 1：配件确认 API 占位，直接返回当前相册 */
async function submitPartConfirm(albumId, userId, _confirmId, _payload) {
  return getUserServiceAlbum(albumId, userId)
}

const ALBUM_CLAIM_PAGE = 'pages/album/claim/index'

async function getAlbumClaimPreview(albumId, userId = '') {
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在或已被删除')
    err.status = 404
    throw err
  }

  let user = null
  if (userId) {
    user = await prisma.user.findUnique({ where: { id: userId } })
  }
  const phone = user?.phone || ''
  const hasOwner = albumHasOwner(album)
  const alreadyOwner =
    Boolean(userId && album.userId === userId) ||
    Boolean(phone && album.userPhone === phone)

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
    albumId: album.id,
    storeName: album.storeName || '—',
    serviceName: album.serviceName || '—',
    vehicleDisplay: formatVehicle(album.vehicleJson),
    claimable,
    alreadyOwner,
    hasOwner,
    reason,
  }
}

async function claimServiceAlbumByUser(albumId, userId, payload = {}) {
  if (!payload.agreed) {
    const err = new Error('请先阅读并同意关联说明')
    err.status = 400
    throw err
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  const phone = String(user?.phone || '').trim()
  if (!/^1\d{10}$/.test(phone)) {
    const err = new Error('请先绑定手机号后再关联服务相册')
    err.status = 403
    throw err
  }

  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在或已被删除')
    err.status = 404
    throw err
  }

  if (albumHasOwner(album)) {
    if (album.userId === userId || album.userPhone === phone) {
      return getUserServiceAlbum(albumId, userId)
    }
    const err = new Error('该服务相册已关联其他车主')
    err.status = 409
    throw err
  }

  await prisma.album.update({
    where: { id: albumId },
    data: {
      userPhone: phone,
      userId,
    },
  })

  return getUserServiceAlbum(albumId, userId)
}

async function getMerchantAlbumClaimQrcode(albumId, storeId, merchantId = '') {
  const album = await loadAlbum(albumId)
  assertMerchantAlbum(album, storeId, merchantId)

  if (!config.wechat.configured) {
    return {
      albumId,
      claimPath: `/pages/album/claim/index?albumId=${albumId}`,
      qrcodeAvailable: false,
      message: '微信未配置，暂无法生成小程序码，请使用转发或复制路径',
    }
  }

  const envVersion = config.nodeEnv === 'production' ? 'release' : 'develop'
  const buffer = await getWxaCodeUnlimited({
    page: ALBUM_CLAIM_PAGE,
    scene: albumId,
    envVersion,
  })

  return {
    albumId,
    claimPath: `/pages/album/claim/index?albumId=${albumId}`,
    qrcodeAvailable: true,
    qrcodeDataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
  }
}

const ALBUM_TEMPLATE_SWITCH_LOCKED = new Set([
  SERVICE_ALBUM_STATUS.COMPLETED,
  SERVICE_ALBUM_STATUS.PUBLISHED,
  'published',
  'pending_review',
])

async function switchMerchantServiceAlbumTemplate(
  albumId,
  storeId,
  templateId,
  merchantId = ''
) {
  const existing = await loadAlbum(albumId)
  assertMerchantAlbum(existing, storeId, merchantId)

  const id = String(templateId || '').trim()
  const tpl = getAlbumTemplateById(id)
  if (!tpl) {
    const err = new Error('无效的相册模板')
    err.status = 400
    throw err
  }

  if (existing.templateId === id) {
    return buildMerchantView(existing)
  }

  if (ALBUM_TEMPLATE_SWITCH_LOCKED.has(existing.status)) {
    const err = new Error('已完工或审核中的相册不可切换模板')
    err.status = 409
    throw err
  }

  const imagesByNode = {}
  ;(existing.images || []).forEach((img) => {
    if (!imagesByNode[img.nodeId]) imagesByNode[img.nodeId] = []
    imagesByNode[img.nodeId].push(img.rawUrl)
  })
  const nodeById = Object.fromEntries((existing.nodes || []).map((n) => [n.nodeId, n]))

  await prisma.albumNode.deleteMany({ where: { albumId } })

  let imageCount = 0
  for (let i = 0; i < tpl.nodes.length; i += 1) {
    const spec = tpl.nodes[i]
    const prev = nodeById[spec.nodeId] || {}
    const urls = imagesByNode[spec.nodeId] || []
    imageCount += urls.length
    const hasContent = urls.length > 0 || String(prev.note || '').trim()
    await prisma.albumNode.create({
      data: {
        albumId,
        nodeId: spec.nodeId,
        title: spec.title,
        sortOrder: i,
        status: hasContent ? 'completed' : 'pending',
        note: prev.note || '',
        updatedAt: prev.updatedAt || null,
      },
    })
  }

  const album = await prisma.album.update({
    where: { id: albumId },
    data: {
      templateId: tpl.templateId,
      templateName: tpl.templateName,
      imageCount,
    },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
    },
  })

  return buildMerchantView(album)
}

module.exports = {
  listUserServiceAlbums,
  listUserRecentServiceAlbums,
  countUserServiceAlbumBindings,
  getUserServiceAlbum,
  listMerchantServiceAlbums,
  getMerchantServiceAlbum,
  createMerchantServiceAlbum,
  saveMerchantServiceAlbum,
  completeMerchantServiceAlbum,
  fetchMerchantAlbumStats,
  submitServiceAlbumAuthorization,
  fetchUserAuthorizations,
  withdrawAuthorization,
  submitPartConfirm,
  buildAlbumView,
  countUserAlbumsForVehicle,
  countUserAlbumsForVehicleRows,
  getAlbumClaimPreview,
  claimServiceAlbumByUser,
  getMerchantAlbumClaimQrcode,
  switchMerchantServiceAlbumTemplate,
  listServiceAlbumTemplateOptions,
  loadAlbum,
}
