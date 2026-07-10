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
const { processUploadedImage } = require('../lib/image-process')

ensureMediaDirs()

async function sendUploadFile(req, res, next) {
  const filePath = resolveUploadFilePath(
    req.params.year,
    req.params.month,
    req.params.filename
  )
  if (!filePath) {
    return fail(res, 100004, '资源不存在', 404)
  }

  const objectKey = `uploads/${req.params.year}/${req.params.month}/${req.params.filename}`
  try {
    const allowed = await canReadOriginalMedia(req, objectKey)
    if (!allowed) {
      return fail(res, 100003, '无权访问该资源', 403)
    }
  } catch (e) {
    return next(e)
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
  limits: { fileSize: 10 * 1024 * 1024 },
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

/** 脱敏图公开读（须在 /:year/:month 之前注册） */
router.get('/files/uploads/desensitized/:albumId/:filename', (req, res, next) => {
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

/** 公开读原图（生产需 signed URL 或 Bearer 归属校验） */
router.get('/files/uploads/:year/:month/:filename', (req, res, next) => {
  sendUploadFile(req, res, next).catch(next)
})

/** 兼容旧 URL：/media/uploads/...（Nginx 已配 /media/ 反代时可用） */
router.get('/legacy/uploads/:year/:month/:filename', (req, res, next) => {
  sendUploadFile(req, res, next).catch(next)
})

/** B-MEDIA-01/02：小程序直传 ECS 本地存储，返回可跨端访问的 HTTPS URL */
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

/** B-MEDIA-07：对 mediaId 创建脱敏产物（B-MASK-03 真实打码） */
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
