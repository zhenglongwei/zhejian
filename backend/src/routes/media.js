const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { ok, fail } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { ROLES } = require('../lib/jwt')
const {
  ensureMediaDirs,
  buildUploadSubdir,
  resolveUploadDir,
  buildPublicMediaUrl,
  createStoredFilename,
  resolveUploadFilePath,
  resolveDesensitizedUploadFilePath,
} = require('../lib/media-storage')
const { createMediaFromUpload, runMediaDesensitize } = require('../services/media.service')
const { canReadOriginalMedia } = require('../services/media-access.service')
const {
  processUploadedImage,
  processUploadedImageBuffer,
  buildThumbObjectKey,
} = require('../lib/image-process')
const { isOssEnabled, createPostObjectToken, contentTypeForKey } = require('../lib/oss-client')
const {
  mediaObjectExists,
  readMediaBuffer,
  writeMediaBuffer,
  signReadableUrlForObjectKey,
  materializeMediaFile,
} = require('../lib/media-blob')
const { config } = require('../config')

ensureMediaDirs()

const MAX_UPLOAD_BYTES =
  (config.media && config.media.oss && config.media.oss.maxUploadBytes) || 10 * 1024 * 1024

function assertImageMeta({ fileName, fileType, fileSize }) {
  const ext = path.extname(String(fileName || '')).toLowerCase()
  const mime = String(fileType || '').toLowerCase()
  const allowedExt = ['.jpg', '.jpeg', '.png', '.webp']
  const allowedMime = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedExt.includes(ext) && !allowedMime.includes(mime)) {
    const err = new Error('仅支持 jpg / png / webp 图片')
    err.status = 400
    throw err
  }
  if (fileSize != null && Number(fileSize) > MAX_UPLOAD_BYTES) {
    const err = new Error('单张图片不能超过 10MB')
    err.status = 400
    throw err
  }
  let safeExt = ext
  if (!allowedExt.includes(safeExt)) {
    if (mime === 'image/png') safeExt = '.png'
    else if (mime === 'image/webp') safeExt = '.webp'
    else safeExt = '.jpg'
  }
  return safeExt
}

async function finalizeUploadedObject(objectKey, uploaderId = '') {
  const key = String(objectKey || '').replace(/\\/g, '/')
  if (!/^uploads\/\d{4}\/\d{2}\/[a-f0-9]{32}\.(jpe?g|png|webp)$/i.test(key)) {
    const err = new Error('无效的 objectKey')
    err.status = 400
    throw err
  }

  const exists = await mediaObjectExists(key)
  if (!exists) {
    const err = new Error('上传对象不存在，请重新上传')
    err.status = 404
    throw err
  }

  const rawBuf = await readMediaBuffer(key)
  const processed = await processUploadedImageBuffer(rawBuf, key)
  if (processed.processed && processed.strippedBuffer) {
    await writeMediaBuffer(key, processed.strippedBuffer, {
      contentType: contentTypeForKey(key),
    })
    if (processed.thumbObjectKey && processed.thumbBuffer) {
      await writeMediaBuffer(processed.thumbObjectKey, processed.thumbBuffer, {
        contentType: 'image/jpeg',
      })
    }
  }

  const url = buildPublicMediaUrl(key)
  const thumbUrl = processed.thumbObjectKey
    ? buildPublicMediaUrl(processed.thumbObjectKey)
    : ''
  const media = await createMediaFromUpload({
    objectKey: key,
    url,
    uploaderId,
  })
  return {
    mediaId: media.id,
    url,
    mediaUrl: url,
    thumbUrl,
    width: processed.width || null,
    height: processed.height || null,
    objectKey: key,
  }
}

async function sendUploadFile(req, res, next) {
  const objectKey = `uploads/${req.params.year}/${req.params.month}/${req.params.filename}`
  try {
    const allowed = await canReadOriginalMedia(req, objectKey)
    if (!allowed) {
      return fail(res, 100003, '无权访问该资源', 403)
    }
  } catch (e) {
    return next(e)
  }

  if (isOssEnabled()) {
    try {
      const signed = await signReadableUrlForObjectKey(objectKey)
      if (signed) {
        res.set('Cache-Control', 'private, max-age=300')
        return res.redirect(302, signed)
      }
    } catch (e) {
      console.warn('[media] oss sign redirect failed', e && e.message)
    }
  }

  const filePath = resolveUploadFilePath(
    req.params.year,
    req.params.month,
    req.params.filename
  )
  if (!filePath) {
    return fail(res, 100004, '资源不存在', 404)
  }

  fs.access(filePath, fs.constants.R_OK, (err) => {
    if (err) {
      return fail(res, 100004, '资源不存在', 404)
    }
    res.set('Cache-Control', 'public, max-age=604800')
    res.type(path.extname(filePath))
    return res.sendFile(filePath, (sendErr) => {
      if (sendErr) next(sendErr)
    })
  })
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const subdir = buildUploadSubdir()
      req.mediaSubdir = subdir
      cb(null, resolveUploadDir(subdir))
    } catch (err) {
      cb(err)
    }
  },
  filename(req, file, cb) {
    cb(null, createStoredFilename(file.originalname))
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const mime = String(file.mimetype || '').toLowerCase()
    const allowedExt = ['.jpg', '.jpeg', '.png', '.webp']
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp']
    if (allowedExt.includes(ext) || allowedMime.includes(mime)) {
      cb(null, true)
      return
    }
    cb(new Error('仅支持 jpg / png / webp 图片'))
  },
})

const router = express.Router()

router.get('/files/uploads/desensitized/:albumId/:filename', async (req, res, next) => {
  const objectKey = `uploads/desensitized/${req.params.albumId}/${req.params.filename}`
  if (isOssEnabled()) {
    try {
      const signed = await signReadableUrlForObjectKey(objectKey)
      if (signed) {
        res.set('Cache-Control', 'private, max-age=300')
        return res.redirect(302, signed)
      }
    } catch (e) {
      console.warn('[media] desensitized oss redirect failed', e && e.message)
    }
  }
  const filePath = resolveDesensitizedUploadFilePath(req.params.albumId, req.params.filename)
  if (!filePath) {
    return fail(res, 100004, '资源不存在', 404)
  }
  fs.access(filePath, fs.constants.R_OK, (err) => {
    if (err) {
      return fail(res, 100004, '资源不存在', 404)
    }
    res.set('Cache-Control', 'public, max-age=604800')
    res.type(path.extname(filePath))
    return res.sendFile(filePath, (sendErr) => {
      if (sendErr) next(sendErr)
    })
  })
})

router.get('/files/uploads/:year/:month/:filename', (req, res, next) => {
  sendUploadFile(req, res, next).catch(next)
})

router.get('/legacy/uploads/:year/:month/:filename', (req, res, next) => {
  sendUploadFile(req, res, next).catch(next)
})

router.post(
  '/upload-token',
  requireAuth([ROLES.USER, ROLES.MERCHANT]),
  async (req, res, next) => {
    try {
      if (!isOssEnabled()) {
        return fail(res, 100001, 'OSS 未开启，请使用直传上传接口', 503)
      }
      const { fileName, fileType, fileSize } = req.body || {}
      if (!fileName) {
        return fail(res, 100001, '缺少 fileName', 400)
      }
      const safeExt = assertImageMeta({ fileName, fileType, fileSize })
      const subdir = buildUploadSubdir()
      const filename = createStoredFilename(`x${safeExt}`)
      const objectKey = `uploads/${subdir}/${filename}`.replace(/\\/g, '/')
      const token = await createPostObjectToken({ objectKey })
      return ok(res, token)
    } catch (e) {
      return next(e)
    }
  }
)

router.post(
  '/upload-complete',
  requireAuth([ROLES.USER, ROLES.MERCHANT]),
  async (req, res, next) => {
    try {
      if (!isOssEnabled()) {
        return fail(res, 100001, 'OSS 未开启', 503)
      }
      const objectKey = String((req.body && req.body.objectKey) || '').trim()
      if (!objectKey) {
        return fail(res, 100001, '缺少 objectKey', 400)
      }
      const uploaderId = (req.auth && req.auth.userId) || ''
      const data = await finalizeUploadedObject(objectKey, uploaderId)
      return ok(res, data)
    } catch (e) {
      return next(e)
    }
  }
)

router.post(
  '/upload',
  requireAuth([ROLES.USER, ROLES.MERCHANT]),
  (req, res, next) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          err.status = 400
          err.message = '单张图片不能超过 10MB'
        }
        return next(err)
      }
      try {
        if (!req.file) {
          return fail(res, 100001, '请选择图片', 400)
        }
        const subdir = req.mediaSubdir || buildUploadSubdir()
        const relativePath = `uploads/${subdir}/${req.file.filename}`.replace(/\\/g, '/')
        const processed = await processUploadedImage(req.file.path, relativePath)

        if (isOssEnabled()) {
          const mainBuf = await fs.promises.readFile(req.file.path)
          await writeMediaBuffer(relativePath, mainBuf, {
            contentType: contentTypeForKey(relativePath),
          })
          if (processed.thumbPath && processed.thumbObjectKey && fs.existsSync(processed.thumbPath)) {
            const thumbBuf = await fs.promises.readFile(processed.thumbPath)
            await writeMediaBuffer(processed.thumbObjectKey, thumbBuf, {
              contentType: 'image/jpeg',
            })
            try {
              fs.unlinkSync(processed.thumbPath)
            } catch (e2) {
              /* ignore */
            }
          }
          try {
            fs.unlinkSync(req.file.path)
          } catch (e2) {
            /* ignore */
          }
        }

        const url = buildPublicMediaUrl(relativePath)
        const thumbUrl = processed.thumbObjectKey
          ? buildPublicMediaUrl(processed.thumbObjectKey)
          : ''
        const uploaderId = (req.auth && req.auth.userId) || ''
        const media = await createMediaFromUpload({
          objectKey: relativePath,
          url,
          uploaderId,
        })
        return ok(res, {
          mediaId: media.id,
          url,
          mediaUrl: url,
          thumbUrl,
          width: processed.width || null,
          height: processed.height || null,
          objectKey: relativePath,
        })
      } catch (e) {
        return next(e)
      }
    })
  }
)

router.post(
  '/:mediaId/desensitize',
  requireAuth([ROLES.USER, ROLES.MERCHANT]),
  async (req, res, next) => {
    try {
      const { albumId, nodeId, idx } = req.body || {}
      const data = await runMediaDesensitize(req.params.mediaId, {
        albumId,
        nodeId,
        idx: idx != null ? Number(idx) : 0,
        auth: req.auth || {},
      })
      return ok(res, {
        taskId: `task_des_${req.params.mediaId}`,
        mediaId: data.mediaId,
        taskStatus: data.taskStatus,
        resultUrl: data.resultUrl,
      })
    } catch (e) {
      return next(e)
    }
  }
)

module.exports = router
module.exports.finalizeUploadedObject = finalizeUploadedObject
module.exports.buildThumbObjectKey = buildThumbObjectKey
module.exports.materializeMediaFile = materializeMediaFile
