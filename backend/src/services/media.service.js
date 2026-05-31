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
const { isStubCopyArtifact } = require('../lib/media-file-compare')
const { processImage, ENGINE_VERSION } = require('./desensitize-engine')
const {
  persistPrivacyDetectionResults,
  hasPrivacyDetectionRecords,
  needsPrivacyDetectionRefresh,
  buildPrivacySummaryFromMedia,
} = require('./privacy-detection.service')

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

function shouldUseCachedDesensitize(media, context = {}) {
  if (!media.desensitizedUrl || media.desensitizeStatus !== DESENSITIZE_STATUS.SUCCESS) {
    return false
  }
  if (!media.desensitizedKey) return false
  if (isStubCopyArtifact(media.objectKey, media.desensitizedKey)) {
    console.info('[media] ignore cached desensitize: stub copy artifact', {
      objectKey: media.objectKey,
      desensitizedKey: media.desensitizedKey,
    })
    return false
  }
  const { albumId = '', nodeId = 'node', idx = 0, engineVersion = '' } = context
  if (engineVersion && engineVersion !== ENGINE_VERSION) {
    return false
  }
  if (albumId) {
    const ext = path.extname(String(media.objectKey || '')).toLowerCase() || '.jpg'
    const expectedKey = buildDesensitizedObjectKey(albumId, nodeId, idx, ext)
    if (media.desensitizedKey !== expectedKey) {
      console.info('[media] ignore cached desensitize: album key mismatch', {
        cached: media.desensitizedKey,
        expected: expectedKey,
      })
      return false
    }
  }
  return true
}

async function shouldRerunDetection(media, context = {}) {
  if (needsPrivacyDetectionRefresh(media, context)) return true
  const hasRecords = await hasPrivacyDetectionRecords(media.id, context.caseId)
  return !hasRecords
}

async function persistEnginePrivacyOutcome(media, {
  engineResult,
  desensitizeStatus,
  desensitizedKey,
  desensitizedUrl,
  caseId,
}) {
  const repo = mediaAssetRepo()
  if (repo) {
    await repo.update({
      where: { id: media.id },
      data: {
        desensitizedKey:
          desensitizeStatus === DESENSITIZE_STATUS.SUCCESS
            ? desensitizedKey
            : media.desensitizedKey,
        desensitizedUrl: desensitizedUrl || media.desensitizedUrl || '',
        desensitizeStatus,
        privacyRiskLevel: engineResult.riskLevel || '',
        riskTags: engineResult.riskTags || [],
        engineVersion: engineResult.engineVersion || ENGINE_VERSION,
        privacyDetectedAt: new Date(),
      },
    })
  }

  await persistPrivacyDetectionResults({
    imageId: media.id,
    caseId,
    engineResult,
    maskedPath: desensitizedKey || media.desensitizedKey || '',
    desensitizeStatus,
  })
}

function buildRunResultFromEngine(media, engineResult, desensitizedUrl) {
  return {
    mediaId: media.id,
    taskStatus: engineResult.taskStatus,
    resultUrl: desensitizedUrl,
    desensitizedUrl,
    riskLevel: engineResult.riskLevel,
    riskTags: engineResult.riskTags || [],
    detections: engineResult.detections || [],
    engineVersion: engineResult.engineVersion || ENGINE_VERSION,
  }
}

/**
 * B-MASK-03/04：打码 + privacy_detection_result 落库
 */
async function runMediaDesensitize(mediaId, context = {}) {
  const media = await getMediaById(mediaId)
  if (!media) {
    const err = new Error('媒体资源不存在')
    err.status = 404
    throw err
  }

  const cacheOk = shouldUseCachedDesensitize(media, context) && !context.force
  if (cacheOk) {
    const rerunDetection = await shouldRerunDetection(media, context)
    if (!rerunDetection) {
      const summary = buildPrivacySummaryFromMedia(media)
      return {
        mediaId: media.id,
        taskStatus: 'SUCCESS',
        resultUrl: media.desensitizedUrl,
        desensitizedUrl: media.desensitizedUrl,
        riskLevel: summary.riskLevel || 'low',
        riskTags: summary.riskTags || [],
        engineVersion: summary.engineVersion || ENGINE_VERSION,
      }
    }
    console.info('[media] cached desensitize but missing privacy records, rerun detection', {
      mediaId: media.id,
    })
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
  const { albumId = 'album', nodeId = 'node', idx = 0, caseId = '' } = context
  const desensitizedKey = buildDesensitizedObjectKey(albumId, nodeId, idx, ext)
  const destPath = resolveDesensitizedFilePath(desensitizedKey)

  try {
    const engineResult = await processImage(sourcePath, destPath, {
      publicUrl: media.url || buildPublicMediaUrl(media.objectKey),
    })
    const desensitizeStatus = mapEngineResultToStatus(engineResult)
    const desensitizedUrl =
      desensitizeStatus === DESENSITIZE_STATUS.SUCCESS
        ? buildPublicMediaUrl(desensitizedKey)
        : media.desensitizedUrl || ''

    await persistEnginePrivacyOutcome(media, {
      engineResult,
      desensitizeStatus,
      desensitizedKey:
        desensitizeStatus === DESENSITIZE_STATUS.SUCCESS ? desensitizedKey : media.desensitizedKey,
      desensitizedUrl,
      caseId,
    })

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

    return buildRunResultFromEngine(media, engineResult, desensitizedUrl)
  } catch (e) {
    if (e.riskLevel && media.id) {
      try {
        await persistPrivacyDetectionResults({
          imageId: media.id,
          caseId: context.caseId,
          engineResult: {
            riskLevel: e.riskLevel,
            riskTags: e.riskTags || [],
            detections: [],
            warnings: [],
          },
          maskedPath: media.desensitizedKey || '',
          desensitizeStatus: e.taskStatus === 'NEED_MANUAL' ? 'need_manual' : 'failed',
        })
      } catch (persistErr) {
        console.warn('[media] persist privacy on error failed', persistErr.message)
      }
    }
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
    const result = await runMediaDesensitize(media.id, {
      ...context,
      engineVersion: ENGINE_VERSION,
    })
    return {
      mediaId: media.id,
      maskedUrl: result.desensitizedUrl,
      ok: Boolean(result.desensitizedUrl),
      riskTags: result.riskTags || [],
      riskLevel: result.riskLevel || '',
    }
  } catch (e) {
    console.warn('[desensitize] asset failed', {
      mediaId: media.id,
      code: e.code || '',
      status: e.status || '',
      message: String(e.message || '').slice(0, 160),
    })
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
