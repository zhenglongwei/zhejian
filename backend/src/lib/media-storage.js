const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { config } = require('../config')
const {
  isOriginalUploadObjectKey,
  stripUrlQuery,
  appendMediaAccessQuery,
} = require('./media-signed-url')

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
  const base = `${config.publicBaseUrl}/api/v1/media/files/${rel}`
  return appendMediaAccessQuery(base, rel)
}

/** 将库内旧域名 URL 统一为当前 PUBLIC_BASE_URL，并为原图补 signed query */
function rewriteMediaUrlForCurrentBase(url) {
  const value = stripUrlQuery(String(url || '').trim())
  if (!value) return ''
  const desKey = parseDesensitizedObjectKeyFromPublicUrl(value)
  if (desKey) return buildPublicMediaUrl(desKey)
  const objectKey = parseObjectKeyFromPublicUrl(value)
  if (objectKey) return buildPublicMediaUrl(objectKey)
  const legacyOriginal = value.match(
    /\/media\/uploads\/(\d{4}\/\d{2}\/[a-f0-9]{32}(?:_thumb)?\.(?:jpe?g|png|webp))/i
  )
  if (legacyOriginal) return buildPublicMediaUrl(`uploads/${legacyOriginal[1]}`)
  const legacyDesensitized = value.match(
    /\/media\/uploads\/(desensitized\/[\w-]+\/[\w-]+_\d+\.(?:jpe?g|png|webp))/i
  )
  if (legacyDesensitized) return buildPublicMediaUrl(`uploads/${legacyDesensitized[1]}`)
  return value
}

/** 客户端可读媒体 URL：统一域名，原图自动补 signed query（/assets 静态资源除外） */
function resolveClientReadableMediaUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  if (value.startsWith('/assets/')) return value
  return rewriteMediaUrlForCurrentBase(value)
}

function resolveClientReadableMediaUrls(urls) {
  return (urls || []).map(resolveClientReadableMediaUrl).filter(Boolean)
}

function resolveUploadFilePath(year, month, filename) {
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) return null
  if (!/^[a-f0-9]{32}(?:_thumb)?\.(jpe?g|png|webp)$/i.test(filename)) return null
  const filePath = path.join(UPLOAD_ROOT, year, month, filename)
  const normalized = path.normalize(filePath)
  if (!normalized.startsWith(UPLOAD_ROOT)) return null
  return normalized
}

/** 从公开 URL 解析 uploads 相对路径，如 uploads/2026/05/abc.jpg */
function parseObjectKeyFromPublicUrl(url) {
  if (!url) return ''
  const value = stripUrlQuery(String(url).trim())
  const match = value.match(
    /\/media\/files\/(uploads\/\d{4}\/\d{2}\/[a-f0-9]{32}(?:_thumb)?\.(?:jpe?g|png|webp))/i
  )
  if (match) return match[1]
  const legacy = value.match(
    /\/media\/uploads\/(\d{4}\/\d{2}\/[a-f0-9]{32}(?:_thumb)?\.(?:jpe?g|png|webp))/i
  )
  if (legacy) return `uploads/${legacy[1]}`
  return ''
}

/** 从公开 URL 解析脱敏产物路径，如 uploads/desensitized/album/node_0.jpg */
function parseDesensitizedObjectKeyFromPublicUrl(url) {
  if (!url) return ''
  const value = stripUrlQuery(String(url).trim())
  const match = value.match(
    /\/(?:api\/v1\/)?media\/files\/(uploads\/desensitized\/[\w-]+\/[\w-]+_\d+\.(?:jpe?g|png|webp))/i
  )
  if (match) return match[1]
  const legacyFiles = value.match(
    /\/media\/files\/(uploads\/desensitized\/[\w-]+\/[\w-]+_\d+\.(?:jpe?g|png|webp))/i
  )
  if (legacyFiles) return legacyFiles[1]
  const legacyUploads = value.match(
    /\/media\/uploads\/(desensitized\/[\w-]+\/[\w-]+_\d+\.(?:jpe?g|png|webp))/i
  )
  if (legacyUploads) return `uploads/${legacyUploads[1]}`
  return ''
}

function resolveMediaFilePathFromPublicUrl(url) {
  const desKey = parseDesensitizedObjectKeyFromPublicUrl(url)
  if (desKey) return resolveDesensitizedFilePath(desKey)
  const key = parseObjectKeyFromPublicUrl(url)
  if (key) return resolveObjectKeyFilePath(key)
  return null
}

function resolveObjectKeyFilePath(objectKey) {
  const key = String(objectKey || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!/^uploads\/\d{4}\/\d{2}\/[a-f0-9]{32}(?:_thumb)?\.(jpe?g|png|webp)$/i.test(key)) {
    return null
  }
  const filePath = path.join(MEDIA_ROOT, key)
  const normalized = path.normalize(filePath)
  if (!normalized.startsWith(MEDIA_ROOT)) return null
  return normalized
}

/**
 * 节点上已写回的打码地址。共用的默认文件不算这张图自己的产物。
 * 解析不出打码路径时也不拿去送模，避免把原图或旁路地址当成打码图。
 */
function usableMaskedProductUrl(url) {
  const value = String(url || '').trim()
  if (!/^https?:\/\//.test(value)) return ''
  const key = parseDesensitizedObjectKeyFromPublicUrl(value)
  if (!key || isCollapsedMaskKey(key)) return ''
  return value
}

/** 未带相册/节点/序号时曾一律写成 album/node_0，多张图互相覆盖 */
function isCollapsedMaskKey(key) {
  return /\/album\/node_0\.(jpe?g|png|webp)$/i.test(String(key || '').replace(/\\/g, '/'))
}

/**
 * 打码文件名只由原图文件名决定。自动打码、手工打码、节点和媒体行都用这一个名字。
 */
function desensitizedKeyForSource({ objectKey = '', id = '', ext = '.jpg' } = {}) {
  const crypto = require('crypto')
  const hash = crypto
    .createHash('sha256')
    .update(String(objectKey || id || 'asset'))
    .digest('hex')
    .slice(0, 16)
  return buildDesensitizedObjectKey('asset', hash, 0, ext)
}

function buildDesensitizedObjectKey(albumId, nodeId, idx, ext = '.jpg') {
  const safeAlbum = String(albumId || 'album').replace(/[^\w-]/g, '_')
  const safeNode = String(nodeId || 'node').replace(/[^\w-]/g, '_')
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(String(ext).toLowerCase())
    ? String(ext).toLowerCase()
    : '.jpg'
  return `uploads/desensitized/${safeAlbum}/${safeNode}_${idx}${safeExt}`
}

function resolveDesensitizedFilePath(objectKey) {
  const key = String(objectKey || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!/^uploads\/desensitized\/[\w-]+\/[\w-]+_\d+\.(jpe?g|png|webp)$/i.test(key)) {
    return null
  }
  const filePath = path.join(MEDIA_ROOT, key)
  const normalized = path.normalize(filePath)
  if (!normalized.startsWith(MEDIA_ROOT)) return null
  const dir = path.dirname(normalized)
  fs.mkdirSync(dir, { recursive: true })
  return normalized
}

function resolveDesensitizedUploadFilePath(albumId, filename) {
  if (!/^[\w-]+$/.test(String(albumId || ''))) return null
  if (!/^[\w-]+_\d+\.(jpe?g|png|webp)$/i.test(String(filename || ''))) return null
  return resolveDesensitizedFilePath(`uploads/desensitized/${albumId}/${filename}`)
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
    value.includes('/__tmp__/') ||
    value.startsWith('http://usr/') ||
    (value.startsWith('http://127.0.0.1') &&
      !value.includes('/media/') &&
      !value.includes('/api/v1/media/')) ||
    (value.startsWith('http://localhost') &&
      !value.includes('/media/') &&
      !value.includes('/api/v1/media/'))
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
  rewriteMediaUrlForCurrentBase,
  resolveClientReadableMediaUrl,
  resolveClientReadableMediaUrls,
  createStoredFilename,
  assertPersistentImageUrl,
  resolveUploadFilePath,
  parseObjectKeyFromPublicUrl,
  parseDesensitizedObjectKeyFromPublicUrl,
  resolveObjectKeyFilePath,
  resolveMediaFilePathFromPublicUrl,
  buildDesensitizedObjectKey,
  isCollapsedMaskKey,
  usableMaskedProductUrl,
  desensitizedKeyForSource,
  resolveDesensitizedFilePath,
  resolveDesensitizedUploadFilePath,
  isOriginalUploadObjectKey,
}
