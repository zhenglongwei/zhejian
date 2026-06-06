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
const { buildAuthorizeTaskId, BIZ_TYPE } = require('./desensitize.constants')
const {
  assertPersistentImageUrl,
  rewriteMediaUrlForCurrentBase,
} = require('../lib/media-storage')
const { resolvePublicCaseMediaUrl } = require('../lib/media-url')
const { config } = require('../config')
const { getWxaCodeUnlimited } = require('../lib/wechat')

const { filterUserAlbumsByTab } = require('../utils/service-album-tab-filter')

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
  return nodeViews.map((node) => ({
    id: node.id,
    title: node.title,
    status: node.status,
    note: node.note || '',
    images: (node.images || []).map((url) => rewriteMediaUrlForCurrentBase(url)),
    updatedAt: node.updatedAt ? toIso(node.updatedAt) : '',
  }))
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
  const vehicle = album.vehicleJson || {}
  const vehicleDisplay = formatVehicle(vehicle)
  const publicCaseStatus = resolvePublicCaseStatus(album)
  const privatePrice = buildPrivateAlbumPrice(album)
  const planAmount = privatePrice.planAmount
  const summaryRows = [
    { label: '服务项目', value: album.serviceName || '—' },
    { label: '门店', value: store.name },
    { label: '车辆', value: vehicleDisplay },
    { label: '图片总数', value: `${imageCount} 张` },
  ]
  if (planAmount != null) {
    summaryRows.splice(3, 0, {
      label: '方案报价',
      value: formatPlanAmountLabel(planAmount),
    })
  }

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
    summaryRows,
  }
  return view
}

function buildMerchantView(album) {
  const nodes = mapNodesForView(album)
  const imageCount = album.imageCount || countImages(nodes)
  const privatePrice = buildPrivateAlbumPrice(album)
  const planAmount = privatePrice.planAmount
  const publicCaseStatus = resolvePublicCaseStatus(album)
  const hasOwner =
    Boolean(String(album.userId || '').trim()) ||
    Boolean(String(album.userPhone || '').trim())
  const isCompleted =
    album.status === SERVICE_ALBUM_STATUS.COMPLETED ||
    album.status === SERVICE_ALBUM_STATUS.PUBLISHED ||
    album.status === 'published'
  const canSubmitColdStartPublicCase =
    isCompleted && !hasOwner && publicCaseStatus === 'private'
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
    vehicle: album.vehicleJson || {},
    vehicleDisplay: formatVehicle(album.vehicleJson),
    storeName: album.storeName || '—',
    storeNote: album.storeNote || '',
    nodes,
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

async function syncAlbumNodes(albumId, nodesPayload = []) {
  const nodes = nodesPayload.length ? nodesPayload : DEFAULT_STAGE_NODES.map((n) => ({
    id: n.nodeId,
    title: n.title,
    status: 'pending',
    note: '',
    images: [],
  }))

  await prisma.albumNode.deleteMany({ where: { albumId } })
  await prisma.albumImage.deleteMany({ where: { albumId } })

  const imageRows = []
  let imageCount = 0

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    const nodeId = node.id || node.nodeId || `stage_${i + 1}`
    await prisma.albumNode.create({
      data: {
        albumId,
        nodeId,
        title: node.title || '',
        sortOrder: i,
        status: node.status || 'pending',
        note: node.note || '',
        updatedAt: node.updatedAt ? new Date(node.updatedAt) : null,
      },
    })
    ;(node.images || []).forEach((url, idx) => {
      if (!url) return
      const rawUrl = assertPersistentImageUrl(
        typeof url === 'string' ? url : url.rawUrl || url.url || ''
      )
      if (!rawUrl) return
      imageRows.push({
        id: `img_${albumId}_${nodeId}_${idx}`,
        albumId,
        nodeId,
        idx,
        rawUrl,
      })
      imageCount += 1
    })
  }

  if (imageRows.length) {
    await prisma.albumImage.createMany({ data: imageRows })
  }

  return imageCount
}

async function listUserServiceAlbums(userId, options = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const phone = user?.phone || ''
  const where = phone ? { OR: [{ userId }, { userPhone: phone }] } : { userId }

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

  return albums
    .map((album) => {
      const view = buildAlbumView(album)
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
      }
    })
    .filter((item) => item.imageCount > 0)
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
    }
  })
}

async function getMerchantServiceAlbum(albumId, storeId, merchantId = '') {
  const album = await loadAlbum(albumId)
  assertMerchantAlbum(album, storeId, merchantId)
  return buildMerchantView(album)
}

async function createMerchantServiceAlbum(merchantId, storeId, payload = {}) {
  const normalized = normalizePlanAmountPayload(payload)
  const planAmount = resolvePlanAmount(normalized)
  const albumId = newId('alb_svc')
  const album = await prisma.album.create({
    data: {
      id: albumId,
      merchantId,
      storeId,
      storeName: payload.storeName || payload.store_name || '门店',
      serviceId: payload.serviceId || '',
      serviceName: payload.serviceName || '服务留档',
      userPhone: payload.userPhone || '',
      complexityLevel: payload.complexityLevel || 'L1',
      vehicleJson: payload.vehicle || {},
      priceMode: planAmount != null ? 'fixed' : '',
      minAmount: planAmount,
      maxAmount: planAmount,
      status: SERVICE_ALBUM_STATUS.DRAFT,
      imageCount: 0,
      nodes: {
        create: DEFAULT_STAGE_NODES.map((n, i) => ({
          nodeId: n.nodeId,
          title: n.title,
          sortOrder: i,
          status: 'pending',
          note: '',
        })),
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

  let imageCount = existing.imageCount
  if (payload.nodes) {
    imageCount = await syncAlbumNodes(albumId, payload.nodes)
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
  const ownerPatch = await resolveOwnerPhoneUpdate(existing, payload)

  const album = await prisma.album.update({
    where: { id: albumId },
    data: {
      serviceName: payload.serviceName ?? existing.serviceName,
      serviceId: payload.serviceId ?? existing.serviceId,
      vehicleJson: payload.vehicle ?? existing.vehicleJson,
      storeNote: payload.storeNote ?? existing.storeNote,
      complexityLevel: payload.complexityLevel ?? existing.complexityLevel,
      partsJson: payload.parts ?? existing.partsJson,
      priceMode: planAmount != null ? 'fixed' : existing.priceMode,
      minAmount: planAmount != null ? planAmount : existing.minAmount,
      maxAmount: planAmount != null ? planAmount : existing.maxAmount,
      status,
      imageCount,
      ...ownerPatch,
    },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
    },
  })
  return buildMerchantView(album)
}

async function completeMerchantServiceAlbum(albumId, storeId, merchantId = '') {
  const existing = await loadAlbum(albumId)
  assertMerchantAlbum(existing, storeId, merchantId)
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
  return buildMerchantView(album)
}

async function fetchMerchantAlbumStats(storeId, merchantId = '') {
  const where = merchantId ? { merchantId } : { storeId }
  const albums = await prisma.album.findMany({ where })
  const active = filterByTab(albums, 'active', MERCHANT_TAB_STATUS).length
  const pendingAuth = filterByTab(albums, 'pending_auth', MERCHANT_TAB_STATUS)
    .filter((a) => a.status === SERVICE_ALBUM_STATUS.COMPLETED).length
  const pendingUpload = albums.filter(
    (a) =>
      [SERVICE_ALBUM_STATUS.DRAFT, 'in_progress'].includes(a.status) &&
      a.imageCount < 2
  ).length
  return { active, pendingAuth, pendingUpload, total: albums.length }
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
      if (!auth && item.publicCaseStatus === 'private') return null
      const authStatus =
        auth?.status === 'user_rejected'
          ? 'rejected'
          : item.publicCaseStatus === 'public_approved'
            ? 'approved'
            : auth?.status === 'authorized'
              ? 'pending_review'
              : 'none'
      return {
        id: item.albumId,
        albumId: item.albumId,
        serviceName: item.serviceName,
        storeName: item.storeName,
        vehicleDisplay: item.vehicleDisplay,
        coverImage: '',
        authStatus,
        publicCaseStatus: item.publicCaseStatus,
        reviewStatus:
          item.publicCaseStatus === 'public_approved'
            ? 'approved'
            : item.publicCaseStatus === 'pending_review'
              ? 'pending'
              : item.publicCaseStatus === 'user_rejected'
                ? 'rejected'
                : 'none',
        canWithdraw: ['pending_review', 'public_approved'].includes(item.publicCaseStatus),
        updatedAt: item.updatedAt,
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
  return { ok: true }
}

/** Phase 1：配件确认 API 占位，直接返回当前相册 */
async function submitPartConfirm(albumId, userId, _confirmId, _payload) {
  return getUserServiceAlbum(albumId, userId)
}

const ALBUM_CLAIM_PAGE = 'pages/album/claim/index'

function albumHasOwner(album) {
  return (
    Boolean(String(album.userId || '').trim()) ||
    Boolean(String(album.userPhone || '').trim())
  )
}

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

module.exports = {
  listUserServiceAlbums,
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
  getAlbumClaimPreview,
  claimServiceAlbumByUser,
  getMerchantAlbumClaimQrcode,
}
