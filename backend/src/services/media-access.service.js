const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { ROLES } = require('../lib/jwt')
const { hasRole } = require('../middleware/auth')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
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
  if (Array.isArray(photos.workshopUrls)) {
    return photos.workshopUrls.some((url) => mediaUrlMatchesObjectKey(url, objectKey))
  }
  return false
}

/**
 * 公开内容目录中的原图（门店门头/环境、已发布 GEO 封面、商家资质证照）允许匿名读。
 * 兜底：API 未补 signed query 或签名 secret 未配置时，仍保证首页/H5 公开展示可用。
 */
async function canAccessViaPublicContentCatalog(objectKey) {
  const key = String(objectKey || '').trim()
  if (!key || !isOriginalUploadObjectKey(key)) return false

  const filename = objectKeyFilename(key)
  if (!filename) return false

  const storeHit = await prisma.store.findFirst({
    where: {
      status: 'ACTIVE',
      merchant: { status: 'ACTIVE' },
      photosJson: { string_contains: filename },
    },
    select: { photosJson: true },
  })
  if (storeHit && storePhotosReferenceObjectKey(storeHit.photosJson, key)) {
    return true
  }

  const geoHit = await prisma.geoPage.findFirst({
    where: {
      status: { in: [GEO_PAGE_STATUS.PUBLISHED, GEO_PAGE_STATUS.NOINDEX] },
      coverImage: { contains: filename },
    },
    select: { coverImage: true },
  })
  if (geoHit && mediaUrlMatchesObjectKey(geoHit.coverImage, key)) {
    return true
  }

  const merchantHit = await prisma.merchant.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [
        { licensePhotoUrl: { contains: filename } },
        { qualificationJson: { string_contains: filename } },
      ],
    },
    select: { licensePhotoUrl: true, qualificationJson: true },
  })
  if (merchantHit) {
    if (mediaUrlMatchesObjectKey(merchantHit.licensePhotoUrl, key)) return true
    const qualification = formatQualificationForClient(merchantHit.qualificationJson)
    if (mediaUrlMatchesObjectKey(qualification?.photoUrl, key)) return true
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
