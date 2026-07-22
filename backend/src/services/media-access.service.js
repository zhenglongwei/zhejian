const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { ROLES } = require('../lib/jwt')
const { hasRole } = require('../middleware/auth')
const { USER_STATUS } = require('../constants/user')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const { PLAN_SALE_STATUS } = require('../constants/service-plan')
const { STORE_EXTRAS } = require('../constants/content-seed')
const { formatQualificationForClient } = require('../lib/onboarding-payload')
const {
  verifyMediaSignature,
  isOriginalUploadObjectKey,
  stripUrlQuery,
} = require('../lib/media-signed-url')

function mediaAssetRepo() {
  return prisma && prisma.mediaAsset ? prisma.mediaAsset : null
}

function baseObjectKey(objectKey) {
  return String(objectKey || '').replace(/_thumb(\.[^./]+)$/i, '$1')
}

function objectKeyFilename(objectKey) {
  const parts = String(objectKey || '').split('/')
  return parts[parts.length - 1] || ''
}

function mediaUrlMatchesObjectKey(url, objectKey) {
  const normalized = stripUrlQuery(String(url || '').trim())
  if (!normalized || !objectKey) return false
  const key = String(objectKey).replace(/^\/+/, '')
  if (normalized.includes(key)) return true
  if (normalized.includes(`/media/files/${key}`)) return true
  const filename = objectKeyFilename(key)
  return filename ? normalized.endsWith(`/${filename}`) || normalized.endsWith(filename) : false
}

function storePhotosReferenceObjectKey(photosJson, objectKey) {
  const photos = photosJson && typeof photosJson === 'object' && !Array.isArray(photosJson) ? photosJson : {}
  if (mediaUrlMatchesObjectKey(photos.facadeUrl, objectKey)) return true
  if (mediaUrlMatchesObjectKey(photos.receptionUrl, objectKey)) return true
  if (mediaUrlMatchesObjectKey(photos.brandAuthUrl, objectKey)) return true
  if (Array.isArray(photos.receptionUrls)) {
    if (photos.receptionUrls.some((url) => mediaUrlMatchesObjectKey(url, objectKey))) return true
  }
  if (Array.isArray(photos.brandAuthItems)) {
    if (
      photos.brandAuthItems.some((item) =>
        mediaUrlMatchesObjectKey(item && item.imageUrl, objectKey)
      )
    ) {
      return true
    }
  }
  if (Array.isArray(photos.workshopUrls)) {
    return photos.workshopUrls.some((url) => mediaUrlMatchesObjectKey(url, objectKey))
  }
  return false
}

function storeExtrasReferenceObjectKey(storeId, objectKey) {
  const extras = STORE_EXTRAS[storeId] || {}
  if (mediaUrlMatchesObjectKey(extras.coverImage, objectKey)) return true
  if (Array.isArray(extras.environmentImages)) {
    return extras.environmentImages.some((url) => mediaUrlMatchesObjectKey(url, objectKey))
  }
  return false
}

function normalizeJsonRow(value) {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch (e) {
      return null
    }
  }
  return value
}

async function matchPublicStorePhotos(objectKey) {
  const filename = objectKeyFilename(objectKey)
  if (!filename) return false

  let rows = []
  try {
    rows = await prisma.$queryRaw`
      SELECT id, photos_json AS photosJson
      FROM stores
      WHERE status = 'ACTIVE'
        AND CAST(photos_json AS CHAR) LIKE ${`%${filename}%`}
      LIMIT 32
    `
  } catch (e) {
    rows = await prisma.store.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, photosJson: true },
      take: 500,
    })
  }

  for (const row of rows) {
    const storeId = row.id
    const photosJson = normalizeJsonRow(row.photosJson)
    if (storePhotosReferenceObjectKey(photosJson, objectKey)) return true
    if (storeExtrasReferenceObjectKey(storeId, objectKey)) return true
  }

  return Object.keys(STORE_EXTRAS).some((storeId) =>
    storeExtrasReferenceObjectKey(storeId, objectKey)
  )
}

async function matchPublicGeoCover(objectKey) {
  const filename = objectKeyFilename(objectKey)
  if (!filename) return false

  const geoHit = await prisma.geoPage.findFirst({
    where: {
      status: { in: [GEO_PAGE_STATUS.PUBLISHED, GEO_PAGE_STATUS.NOINDEX] },
      coverImage: { contains: filename },
    },
    select: { coverImage: true },
  })
  return Boolean(geoHit && mediaUrlMatchesObjectKey(geoHit.coverImage, objectKey))
}

async function matchPublicMerchantCredentials(objectKey) {
  const merchants = await prisma.merchant.findMany({
    where: {
      stores: { some: { status: 'ACTIVE' } },
    },
    select: { licensePhotoUrl: true, qualificationJson: true },
    take: 200,
  })

  for (const merchant of merchants) {
    if (mediaUrlMatchesObjectKey(merchant.licensePhotoUrl, objectKey)) return true
    const qualification = formatQualificationForClient(merchant.qualificationJson)
    if (mediaUrlMatchesObjectKey(qualification?.photoUrl, objectKey)) return true
    if (mediaUrlMatchesObjectKey(qualification?.newEnergy?.photoUrl, objectKey)) return true
  }
  return false
}

async function matchPublicServicePlanCover(objectKey) {
  const filename = objectKeyFilename(objectKey)
  if (!filename) return false

  const planHit = await prisma.merchantServicePlan.findFirst({
    where: {
      saleStatus: PLAN_SALE_STATUS.ONLINE,
      coverUrl: { contains: filename },
    },
    select: { coverUrl: true },
  })
  return Boolean(planHit && mediaUrlMatchesObjectKey(planHit.coverUrl, objectKey))
}

/** 服务相册原图：album_images 表引用（商家/车主编辑页 <image> 无法带 Bearer） */
async function matchAlbumImageMedia(objectKey) {
  const filename = objectKeyFilename(objectKey)
  const needle = String(objectKey || '').trim()
  if (!filename && !needle) return false

  const row = await prisma.albumImage.findFirst({
    where: {
      OR: [
        { rawUrl: { contains: filename || needle } },
        { rawUrl: { endsWith: filename || needle } },
      ],
    },
    select: { rawUrl: true },
  })
  return Boolean(row && mediaUrlMatchesObjectKey(row.rawUrl, objectKey))
}

/** 用户头像：写入 users.avatar_url 后需供 <image> 匿名加载 */
async function matchPublicUserAvatar(objectKey) {
  const filename = objectKeyFilename(objectKey)
  if (!filename) return false

  const userHit = await prisma.user.findFirst({
    where: {
      status: USER_STATUS.ACTIVE,
      avatarUrl: { contains: filename },
    },
    select: { avatarUrl: true },
  })
  return Boolean(userHit && mediaUrlMatchesObjectKey(userHit.avatarUrl, objectKey))
}

/**
 * 公开内容目录中的原图（用户头像、门店门头/环境、GEO 封面、商家证照等）允许匿名读。
 * 兜底：API 未补 signed query 时，仍保证小程序/H5 <image> 可加载。
 */
async function canAccessViaPublicContentCatalog(objectKey) {
  const candidates = [...new Set([String(objectKey || '').trim(), baseObjectKey(objectKey)].filter(Boolean))]
  for (const key of candidates) {
    if (!key || !isOriginalUploadObjectKey(key)) continue
    if (await matchPublicUserAvatar(key)) return true
    if (await matchPublicStorePhotos(key)) return true
    if (await matchPublicGeoCover(key)) return true
    if (await matchPublicMerchantCredentials(key)) return true
    if (await matchPublicServicePlanCover(key)) return true
  }
  return false
}

async function canUserAccessAlbumRow(album, userId) {
  if (!album || !userId) return false
  if (album.userId === userId) return true
  if (!album.userPhone) return false
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true },
  })
  return Boolean(user?.phone && user.phone === album.userPhone)
}

async function canAccessViaAlbumImage(objectKey, auth) {
  const needle = String(objectKey || '').trim()
  if (!needle) return false

  const row = await prisma.albumImage.findFirst({
    where: {
      OR: [
        { rawUrl: { contains: needle } },
        { rawUrl: { endsWith: needle } },
      ],
    },
    select: {
      album: {
        select: { userId: true, userPhone: true, merchantId: true },
      },
    },
  })
  const album = row?.album
  if (!album) return false

  if (hasRole(auth, ROLES.MERCHANT) && auth.merchantId && album.merchantId === auth.merchantId) {
    return true
  }
  if (hasRole(auth, ROLES.USER) && auth.userId) {
    return canUserAccessAlbumRow(album, auth.userId)
  }
  return false
}

async function canAccessViaMediaAsset(objectKey, auth) {
  const repo = mediaAssetRepo()
  if (!repo) return false

  const keys = [objectKey, baseObjectKey(objectKey)].filter(Boolean)
  const media = await repo.findFirst({
    where: { objectKey: { in: keys } },
    select: { uploaderId: true },
  })
  if (!media?.uploaderId) return false
  return Boolean(auth.userId && media.uploaderId === auth.userId)
}

/**
 * 原图读权限：signed query 或 Bearer（上传者 / 相册归属 / system）
 */
async function canReadOriginalMedia(req, objectKey) {
  if (!config.media.signedUrlsEnabled) return true
  if (!isOriginalUploadObjectKey(objectKey)) return true

  const exp = req.query?.exp
  const sig = req.query?.sig
  if (verifyMediaSignature(objectKey, exp, sig)) return true

  if (await matchAlbumImageMedia(objectKey)) return true
  if (await canAccessViaPublicContentCatalog(objectKey)) return true

  const auth = req.auth || {}
  if (!auth.token) return false
  if (hasRole(auth, ROLES.SYSTEM)) return true
  if (await canAccessViaMediaAsset(objectKey, auth)) return true
  if (await canAccessViaAlbumImage(objectKey, auth)) return true
  return false
}

module.exports = {
  canReadOriginalMedia,
  canAccessViaAlbumImage,
  canAccessViaMediaAsset,
  canAccessViaPublicContentCatalog,
  mediaUrlMatchesObjectKey,
}
