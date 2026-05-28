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
} = require('../lib/media-storage')

ensureMediaDirs()

function sendUploadFile(req, res, next) {
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

/** 公开读图（随机文件名，无鉴权；须走 /api/ 反代） */
router.get('/files/uploads/:year/:month/:filename', sendUploadFile)

/** 兼容旧 URL：/media/uploads/...（Nginx 已配 /media/ 反代时可用） */
router.get('/legacy/uploads/:year/:month/:filename', sendUploadFile)

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
