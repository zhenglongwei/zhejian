const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { config } = require('../config')

const MEDIA_ROOT = process.env.MEDIA_STORAGE_DIR
  ? path.resolve(process.env.MEDIA_STORAGE_DIR)
  : path.join(process.cwd(), 'data', 'media')

const UPLOAD_ROOT = path.join(MEDIA_ROOT, 'uploads')

function ensureMediaDirs() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true })
}

function buildUploadSubdir(date = new Date()) {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}/${month}`
}

function resolveUploadDir(subdir) {
  const safe = String(subdir || '').replace(/\\/g, '/').replace(/\.\./g, '')
  const dest = path.join(UPLOAD_ROOT, safe)
  fs.mkdirSync(dest, { recursive: true })
  return dest
}

function buildPublicMediaUrl(relativePath) {
  const rel = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  return `${config.publicBaseUrl}/media/${rel}`
}

function createStoredFilename(originalName = '') {
  const ext = path.extname(originalName).toLowerCase()
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg'
  return `${crypto.randomBytes(16).toString('hex')}${safeExt}`
}

function assertPersistentImageUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  if (
    value.startsWith('wxfile://') ||
    value.includes('://tmp/') ||
    (value.startsWith('http://127.0.0.1') && !value.includes('/media/uploads/')) ||
    (value.startsWith('http://localhost') && !value.includes('/media/uploads/'))
  ) {
    const err = new Error('包含未上传的本地图片，请重新保存')
    err.status = 400
    throw err
  }
  return value
}

module.exports = {
  MEDIA_ROOT,
  UPLOAD_ROOT,
  ensureMediaDirs,
  buildUploadSubdir,
  resolveUploadDir,
  buildPublicMediaUrl,
  createStoredFilename,
  assertPersistentImageUrl,
}
