const { prisma, assertPrismaDelegate } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { CASE_ARTICLE_H5_PUBLISHED_STATUSES } = require('../constants/case-article-status')
const { PLAN_SALE_STATUS } = require('../constants/service-plan')
const { formatPlanRecord } = require('./service-plan-format')
const { mapStoreRow, mapPublicCaseRow, applyPublicDisplayRules } = require('./content.service')

const FAVORITE_TYPES = new Set(['store', 'service', 'case'])
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

async function assertPhoneBound(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } })
  if (!user || !user.phone) {
    const err = new Error('请先绑定手机号')
    err.status = 403
    throw err
  }
}

function normalizeFavoriteType(type) {
  const value = String(type || '').trim().toLowerCase()
  if (!FAVORITE_TYPES.has(value)) {
    const err = new Error('收藏类型无效')
    err.status = 400
    throw err
  }
  return value
}

function parsePagination(query = {}) {
  const page = Math.max(parseInt(String(query.page || DEFAULT_PAGE), 10) || DEFAULT_PAGE, 1)
  const pageSize = Math.min(
    Math.max(parseInt(String(query.page_size || query.pageSize || DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE
  )
  return { page, pageSize, skip: (page - 1) * pageSize }
}

async function assertFavoriteTargetExists(targetType, targetId) {
  const id = String(targetId || '').trim()
  if (!id) {
    const err = new Error('收藏对象不存在')
    err.status = 404
    throw err
  }

  if (targetType === 'store') {
    const store = await prisma.store.findUnique({ where: { id } })
    if (!store) {
      const err = new Error('门店不存在')
      err.status = 404
      throw err
    }
    return
  }

  if (targetType === 'service') {
    const plan = await prisma.merchantServicePlan.findUnique({ where: { id } })
    if (!plan) {
      const err = new Error('服务不存在')
      err.status = 404
      throw err
    }
    return
  }

  const row = await prisma.publicCase.findUnique({ where: { id } })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
}

async function resolveStoreAvailability(storeId) {
  if (!storeId) return { available: false, unavailableReason: '暂不可查看' }
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { merchant: { select: { status: true } } },
  })
  if (!store || store.status !== 'ACTIVE' || store.merchant?.status !== 'ACTIVE') {
    return { available: false, unavailableReason: '已下架' }
  }
  return { available: true, unavailableReason: '' }
}

async function resolveServiceAvailability(serviceId) {
  const row = await prisma.merchantServicePlan.findUnique({ where: { id: serviceId } })
  if (!row || row.saleStatus !== PLAN_SALE_STATUS.ONLINE) {
    return { available: false, unavailableReason: '已下架' }
  }
  const store = await prisma.store.findUnique({ where: { id: row.storeId } })
  if (!store || store.status !== 'ACTIVE') {
    return { available: false, unavailableReason: '已下架' }
  }
  return { available: true, unavailableReason: '' }
}

async function resolveCaseAvailability(caseId) {
  const row = await prisma.publicCase.findFirst({
    where: {
      id: caseId,
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      articleStatus: { in: CASE_ARTICLE_H5_PUBLISHED_STATUSES },
    },
  })
  if (!row) {
    return { available: false, unavailableReason: '暂不可查看' }
  }
  const storeCheck = await resolveStoreAvailability(row.storeId)
  if (!storeCheck.available) {
    return { available: false, unavailableReason: '暂不可查看' }
  }
  return { available: true, unavailableReason: '' }
}

async function enrichStoreFavorite(row) {
  const store = await prisma.store.findUnique({ where: { id: row.targetId } })
  if (!store) {
    return {
      favoriteId: row.id,
      targetType: 'store',
      targetId: row.targetId,
      createdAt: row.createdAt,
      available: false,
      unavailableReason: '已下架',
      item: null,
    }
  }
  const caseCount = await prisma.publicCase.count({
    where: {
      storeId: store.id,
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      articleStatus: { in: CASE_ARTICLE_H5_PUBLISHED_STATUSES },
    },
  })
  const availability = await resolveStoreAvailability(store.id)
  return {
    favoriteId: row.id,
    targetType: 'store',
    targetId: row.targetId,
    createdAt: row.createdAt,
    ...availability,
    item: mapStoreRow(store, caseCount),
  }
}

async function enrichServiceFavorite(row) {
  const plan = await prisma.merchantServicePlan.findUnique({ where: { id: row.targetId } })
  if (!plan) {
    return {
      favoriteId: row.id,
      targetType: 'service',
      targetId: row.targetId,
      createdAt: row.createdAt,
      available: false,
      unavailableReason: '已下架',
      item: null,
    }
  }
  const store = await prisma.store.findUnique({ where: { id: plan.storeId } })
  const availability = await resolveServiceAvailability(plan.id)
  return {
    favoriteId: row.id,
    targetType: 'service',
    targetId: row.targetId,
    createdAt: row.createdAt,
    ...availability,
    item: store ? formatPlanRecord(plan, store) : formatPlanRecord(plan, null),
  }
}

async function enrichCaseFavorite(row) {
  const caseRow = await prisma.publicCase.findUnique({ where: { id: row.targetId } })
  if (!caseRow) {
    return {
      favoriteId: row.id,
      targetType: 'case',
      targetId: row.targetId,
      createdAt: row.createdAt,
      available: false,
      unavailableReason: '暂不可查看',
      item: null,
    }
  }
  const album = caseRow.albumId
    ? await prisma.album.findUnique({
        where: { id: caseRow.albumId },
        include: {
          nodes: { orderBy: { sortOrder: 'asc' } },
          images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
        },
      })
    : null
  const availability = await resolveCaseAvailability(caseRow.id)
  const mapped = applyPublicDisplayRules(mapPublicCaseRow(caseRow, album))
  return {
    favoriteId: row.id,
    targetType: 'case',
    targetId: row.targetId,
    createdAt: row.createdAt,
    ...availability,
    item: mapped,
  }
}

async function enrichFavoriteRow(row) {
  if (row.targetType === 'store') return enrichStoreFavorite(row)
  if (row.targetType === 'service') return enrichServiceFavorite(row)
  return enrichCaseFavorite(row)
}

async function listUserFavorites(userId, query = {}) {
  assertPrismaDelegate('userFavorite', '收藏')
  await assertPhoneBound(userId)
  const targetType = normalizeFavoriteType(query.type)
  const { page, pageSize, skip } = parsePagination(query)

  const where = { userId, targetType }
  const [total, rows] = await Promise.all([
    prisma.userFavorite.count({ where }),
    prisma.userFavorite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
  ])

  const list = await Promise.all(rows.map((row) => enrichFavoriteRow(row)))
  return {
    list,
    pagination: {
      page,
      page_size: pageSize,
      total,
      has_more: skip + rows.length < total,
    },
  }
}

async function getFavoriteStatus(userId, targetTypeRaw, targetIdRaw) {
  assertPrismaDelegate('userFavorite', '收藏')
  const targetType = normalizeFavoriteType(targetTypeRaw)
  const targetId = String(targetIdRaw || '').trim()
  if (!targetId) {
    const err = new Error('收藏对象不存在')
    err.status = 400
    throw err
  }

  if (!userId) {
    return { favorited: false, favoriteId: '' }
  }

  const row = await prisma.userFavorite.findUnique({
    where: {
      userId_targetType_targetId: { userId, targetType, targetId },
    },
  })
  return { favorited: Boolean(row), favoriteId: row?.id || '' }
}

async function addUserFavorite(userId, payload = {}) {
  assertPrismaDelegate('userFavorite', '收藏')
  await assertPhoneBound(userId)
  const targetType = normalizeFavoriteType(payload.targetType)
  const targetId = String(payload.targetId || '').trim()
  await assertFavoriteTargetExists(targetType, targetId)

  const existing = await prisma.userFavorite.findUnique({
    where: {
      userId_targetType_targetId: { userId, targetType, targetId },
    },
  })
  if (existing) {
    return { favoriteId: existing.id, favorited: true }
  }

  const row = await prisma.userFavorite.create({
    data: {
      id: newId('fav'),
      userId,
      targetType,
      targetId,
    },
  })
  return { favoriteId: row.id, favorited: true }
}

async function removeUserFavorite(userId, payload = {}) {
  assertPrismaDelegate('userFavorite', '收藏')
  await assertPhoneBound(userId)
  const targetType = normalizeFavoriteType(payload.targetType)
  const targetId = String(payload.targetId || '').trim()

  await prisma.userFavorite.deleteMany({
    where: { userId, targetType, targetId },
  })
  return { favorited: false }
}

module.exports = {
  listUserFavorites,
  getFavoriteStatus,
  addUserFavorite,
  removeUserFavorite,
}
