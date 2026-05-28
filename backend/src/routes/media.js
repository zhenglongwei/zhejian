const express = require('express')
const multer = require('multer')
const path = require('path')
const { ok, fail } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const { ROLES } = require('../lib/jwt')
const {
  ensureMediaDirs,
  buildUploadSubdir,
  resolveUploadDir,
  buildPublicMediaUrl,
  createStoredFilename,
} = require('../lib/media-storage')

ensureMediaDirs()

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

/** B-MEDIA-01/02：小程序直传 ECS 本地存储，返回可跨端访问的 HTTPS URL */
router.post(
  '/upload',
  requireAuth([ROLES.USER, ROLES.MERCHANT]),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          err.status = 400
          err.message = '单张图片不能超过 10MB'
        }
        return next(err)
      }
      next()
    })
  },
  (req, res) => {
    if (!req.file) {
      return fail(res, 100001, '请选择图片', 400)
    }
    const subdir = req.mediaSubdir || buildUploadSubdir()
    const relativePath = `uploads/${subdir}/${req.file.filename}`.replace(/\\/g, '/')
    const url = buildPublicMediaUrl(relativePath)
    return ok(res, {
      url,
      mediaUrl: url,
      objectKey: relativePath,
    })
  }
)

module.exports = router
