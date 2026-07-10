const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { ROLES } = require('../lib/jwt')
const { hasRole } = require('../middleware/auth')
const { verifyMediaSignature, isOriginalUploadObjectKey } = require('../lib/media-signed-url')

function mediaAssetRepo() {
  return prisma && prisma.mediaAsset ? prisma.mediaAsset : null
}

function baseObjectKey(objectKey) {
  return String(objectKey || '').replace(/_thumb(\.[^./]+)$/i, '$1')
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
}
