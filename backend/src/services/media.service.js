const fs = require('fs')
const path = require('path')
const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const {
  buildPublicMediaUrl,
  parseObjectKeyFromPublicUrl,
  resolveObjectKeyFilePath,
  buildDesensitizedObjectKey,
  resolveDesensitizedFilePath,
} = require('../lib/media-storage')

const DESENSITIZE_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
}

function mediaAssetRepo() {
  return prisma && prisma.mediaAsset ? prisma.mediaAsset : null
}

async function createMediaFromUpload({ objectKey, url, uploaderId = '' }) {
  const key = String(objectKey || '').replace(/\\/g, '/')
  const publicUrl = String(url || buildPublicMediaUrl(key))
  const repo = mediaAssetRepo()
  if (!repo) {
    console.warn('[media] prisma.mediaAsset 不可用，跳过 media_assets 写入（请执行 npm run db:setup:prod）')
    return {
      id: '',
      objectKey: key,
      url: publicUrl,
      uploaderId: uploaderId || '',
      desensitizeStatus: DESENSITIZE_STATUS.PENDING,
    }
  }
  const existing = await repo.findFirst({
    where: { objectKey: key },
  })
  if (existing) {
    return existing
  }
  return repo.create({
    data: {
      id: newId('media'),
      objectKey: key,
      url: publicUrl,
      uploaderId: uploaderId || '',
      desensitizeStatus: DESENSITIZE_STATUS.PENDING,
    },
  })
}

async function ensureMediaRecordFromUrl(rawUrl, uploaderId = '') {
  const objectKey = parseObjectKeyFromPublicUrl(rawUrl)
  if (!objectKey) {
    return null
  }
  const repo = mediaAssetRepo()
  if (!repo) {
    return null
  }
  const url = String(rawUrl).trim()
  const existing = await repo.findFirst({ where: { objectKey } })
  if (existing) {
    return existing
  }
  return repo.create({
    data: {
      id: newId('media'),
      objectKey,
      url,
      uploaderId: uploaderId || '',
      desensitizeStatus: DESENSITIZE_STATUS.PENDING,
    },
  })
}

async function getMediaById(mediaId) {
  if (!mediaId) return null
  const repo = mediaAssetRepo()
  if (!repo) return null
  return repo.findUnique({ where: { id: mediaId } })
}

/**
 * MVP 脱敏：将原图复制到 uploads/desensitized/ 并返回可加载 URL。
 * Phase 2 可替换为真实 OCR/打码服务。
 */
async function runMediaDesensitize(mediaId, context = {}) {
  const media = await getMediaById(mediaId)
  if (!media) {
    const err = new Error('媒体资源不存在')
    err.status = 404
    throw err
  }

  if (media.desensitizedUrl && media.desensitizeStatus === DESENSITIZE_STATUS.SUCCESS) {
    return {
      mediaId: media.id,
      taskStatus: 'SUCCESS',
      resultUrl: media.desensitizedUrl,
      desensitizedUrl: media.desensitizedUrl,
    }
  }

  const sourcePath = resolveObjectKeyFilePath(media.objectKey)
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    const repo = mediaAssetRepo()
    if (repo) {
      await repo.update({
        where: { id: media.id },
        data: { desensitizeStatus: DESENSITIZE_STATUS.FAILED },
      })
    }
    const err = new Error('原图文件不存在')
    err.status = 404
    throw err
  }

  const ext = path.extname(sourcePath).toLowerCase() || '.jpg'
  const { albumId = 'album', nodeId = 'node', idx = 0 } = context
  const desensitizedKey = buildDesensitizedObjectKey(albumId, nodeId, idx, ext)
  const destPath = resolveDesensitizedFilePath(desensitizedKey)

  try {
    fs.copyFileSync(sourcePath, destPath)
    const desensitizedUrl = buildPublicMediaUrl(desensitizedKey)
    const repo = mediaAssetRepo()
    if (repo) {
      await repo.update({
        where: { id: media.id },
        data: {
          desensitizedKey,
          desensitizedUrl,
          desensitizeStatus: DESENSITIZE_STATUS.SUCCESS,
        },
      })
    }
    return {
      mediaId: media.id,
      taskStatus: 'SUCCESS',
      resultUrl: desensitizedUrl,
      desensitizedUrl,
    }
  } catch (e) {
    const repo = mediaAssetRepo()
    if (repo) {
      await repo.update({
        where: { id: media.id },
        data: { desensitizeStatus: DESENSITIZE_STATUS.FAILED },
      })
    }
    throw e
  }
}

async function resolveDesensitizedUrlForAsset(rawUrl, context = {}) {
  const media = await ensureMediaRecordFromUrl(rawUrl)
  if (!media) {
    return { mediaId: '', maskedUrl: '', ok: false }
  }
  try {
    const result = await runMediaDesensitize(media.id, context)
    return {
      mediaId: media.id,
      maskedUrl: result.desensitizedUrl,
      ok: Boolean(result.desensitizedUrl),
    }
  } catch (e) {
    return { mediaId: media.id, maskedUrl: '', ok: false }
  }
}

module.exports = {
  DESENSITIZE_STATUS,
  createMediaFromUpload,
  ensureMediaRecordFromUrl,
  getMediaById,
  runMediaDesensitize,
  resolveDesensitizedUrlForAsset,
  parseObjectKeyFromPublicUrl,
}
