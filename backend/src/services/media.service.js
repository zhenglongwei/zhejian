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
const { processImage } = require('./desensitize-engine')

const DESENSITIZE_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
  NEED_MANUAL: 'need_manual',
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

function mapEngineResultToStatus(engineResult) {
  if (engineResult.taskStatus === 'NEED_MANUAL') {
    return DESENSITIZE_STATUS.NEED_MANUAL
  }
  if (engineResult.taskStatus === 'SUCCESS') {
    return DESENSITIZE_STATUS.SUCCESS
  }
  return DESENSITIZE_STATUS.FAILED
}

/**
 * B-MASK-03：阿里云检测 + 本地 sharp 打码，写入 uploads/desensitized/
 */
async function runMediaDesensitize(mediaId, context = {}) {
  const media = await getMediaById(mediaId)
  if (!media) {
    const err = new Error('媒体资源不存在')
    err.status = 404
    throw err
  }

  if (
    media.desensitizedUrl &&
    media.desensitizeStatus === DESENSITIZE_STATUS.SUCCESS &&
    !context.force
  ) {
    return {
      mediaId: media.id,
      taskStatus: 'SUCCESS',
      resultUrl: media.desensitizedUrl,
      desensitizedUrl: media.desensitizedUrl,
      riskLevel: 'low',
      riskTags: [],
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
    const engineResult = await processImage(sourcePath, destPath)
    const desensitizeStatus = mapEngineResultToStatus(engineResult)
    const desensitizedUrl =
      desensitizeStatus === DESENSITIZE_STATUS.SUCCESS
        ? buildPublicMediaUrl(desensitizedKey)
        : ''

    const repo = mediaAssetRepo()
    if (repo) {
      await repo.update({
        where: { id: media.id },
        data: {
          desensitizedKey: desensitizeStatus === DESENSITIZE_STATUS.SUCCESS ? desensitizedKey : media.desensitizedKey,
          desensitizedUrl: desensitizedUrl || media.desensitizedUrl || '',
          desensitizeStatus,
        },
      })
    }

    if (desensitizeStatus !== DESENSITIZE_STATUS.SUCCESS) {
      const err = new Error(
        desensitizeStatus === DESENSITIZE_STATUS.NEED_MANUAL
          ? '脱敏需人工处理'
          : '脱敏失败'
      )
      err.status = 422
      err.taskStatus = engineResult.taskStatus
      err.riskLevel = engineResult.riskLevel
      err.riskTags = engineResult.riskTags
      throw err
    }

    return {
      mediaId: media.id,
      taskStatus: engineResult.taskStatus,
      resultUrl: desensitizedUrl,
      desensitizedUrl,
      riskLevel: engineResult.riskLevel,
      riskTags: engineResult.riskTags || [],
      detections: engineResult.detections || [],
      engineVersion: engineResult.engineVersion,
    }
  } catch (e) {
    if (!e.status) {
      const repo = mediaAssetRepo()
      if (repo) {
        await repo.update({
          where: { id: media.id },
          data: { desensitizeStatus: DESENSITIZE_STATUS.FAILED },
        })
      }
    }
    throw e
  }
}

async function resolveDesensitizedUrlForAsset(rawUrl, context = {}) {
  const media = await ensureMediaRecordFromUrl(rawUrl)
  if (!media) {
    return { mediaId: '', maskedUrl: '', ok: false, riskTags: [], riskLevel: '' }
  }
  try {
    const result = await runMediaDesensitize(media.id, context)
    return {
      mediaId: media.id,
      maskedUrl: result.desensitizedUrl,
      ok: Boolean(result.desensitizedUrl),
      riskTags: result.riskTags || [],
      riskLevel: result.riskLevel || '',
    }
  } catch (e) {
    return {
      mediaId: media.id,
      maskedUrl: '',
      ok: false,
      riskTags: e.riskTags || [],
      riskLevel: e.riskLevel || '',
      needManual: e.taskStatus === 'NEED_MANUAL',
    }
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
