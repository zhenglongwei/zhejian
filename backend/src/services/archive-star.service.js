const { prisma, assertPrismaDelegate } = require('../lib/prisma')
const { resolveClientReadableMediaUrl } = require('../lib/media-storage')
const { formatPublicStargazer } = require('../utils/archive-star-display')
const { addUserFavorite, removeUserFavorite, getFavoriteStatus } = require('./favorite.service')

async function assertPublicCaseExists(caseId) {
  const id = String(caseId || '').trim()
  const row = await prisma.publicCase.findUnique({ where: { id }, select: { id: true } })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  return id
}

async function resolveStoreActor(userId) {
  const staff = await prisma.merchantStaff.findFirst({
    where: { userId, status: 'ACTIVE' },
    select: { storeId: true, merchantId: true },
  })
  if (!staff) return null
  let store = null
  if (staff.storeId) {
    store = await prisma.store.findUnique({
      where: { id: staff.storeId },
      select: { id: true, name: true, photosJson: true },
    })
  }
  if (!store) {
    store = await prisma.store.findFirst({
      where: { merchantId: staff.merchantId, status: 'ACTIVE' },
      select: { id: true, name: true, photosJson: true },
    })
  }
  if (!store || !store.name) return null
  const photos = store.photosJson && typeof store.photosJson === 'object' ? store.photosJson : {}
  const logo = Array.isArray(photos.logos) ? photos.logos[0] : photos.logo || ''
  return {
    id: store.id,
    name: store.name,
    avatarUrl: resolveClientReadableMediaUrl(logo || ''),
  }
}

async function listCaseStars(caseId, options = {}) {
  assertPrismaDelegate('userFavorite', '星标')
  const id = await assertPublicCaseExists(caseId)
  const userId = options.userId || ''
  const where = { targetType: 'case', targetId: id }
  const [count, rows, mine] = await Promise.all([
    prisma.userFavorite.count({ where }),
    prisma.userFavorite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
    }),
    userId
      ? prisma.userFavorite.findUnique({
          where: {
            userId_targetType_targetId: { userId, targetType: 'case', targetId: id },
          },
        })
      : Promise.resolve(null),
  ])

  const list = []
  for (const row of rows) {
    const store = row.userId ? await resolveStoreActor(row.userId) : null
    list.push(
      formatPublicStargazer({
        user: row.user
          ? {
              nickname: row.user.nickname,
              avatarUrl: resolveClientReadableMediaUrl(row.user.avatarUrl || ''),
            }
          : null,
        store,
      })
    )
  }
  return { count, starred: Boolean(mine), list }
}

async function toggleCaseStar(userId, caseId) {
  const id = await assertPublicCaseExists(caseId)
  const status = await getFavoriteStatus(userId, 'case', id)
  if (status.favorited) {
    await removeUserFavorite(userId, { targetType: 'case', targetId: id })
  } else {
    await addUserFavorite(userId, { targetType: 'case', targetId: id })
  }
  return listCaseStars(id, { userId })
}

module.exports = {
  listCaseStars,
  toggleCaseStar,
}
