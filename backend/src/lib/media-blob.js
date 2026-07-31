/**
 * 媒体二进制读写：OSS 优先，本地盘双读/双写（迁移窗口）
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  resolveObjectKeyFilePath,
  resolveDesensitizedFilePath,
  parseObjectKeyFromPublicUrl,
  parseDesensitizedObjectKeyFromPublicUrl,
  MEDIA_ROOT,
} = require('./media-storage')
const {
  isOssEnabled,
  getObjectBuffer,
  putObject,
  objectExists,
  contentTypeForKey,
  signObjectUrl,
  ossConfig,
} = require('./oss-client')
const { isOriginalUploadObjectKey } = require('./media-signed-url')

function normalizeObjectKey(objectKey) {
  return String(objectKey || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
}

function resolveLocalPathForKey(objectKey) {
  const key = normalizeObjectKey(objectKey)
  if (!key) return null
  if (key.startsWith('uploads/desensitized/')) {
    return resolveDesensitizedFilePath(key)
  }
  return resolveObjectKeyFilePath(key)
}

async function mediaObjectExists(objectKey) {
  const key = normalizeObjectKey(objectKey)
  if (!key) return false
  if (isOssEnabled()) {
    try {
      if (await objectExists(key)) return true
    } catch (e) {
      console.warn('[media-blob] oss head failed', key, e && e.message)
    }
  }
  const local = resolveLocalPathForKey(key)
  return Boolean(local && fs.existsSync(local))
}

async function readMediaBuffer(objectKey) {
  const key = normalizeObjectKey(objectKey)
  if (!key) {
    const err = new Error('无效的媒体路径')
    err.status = 400
    throw err
  }
  if (isOssEnabled()) {
    try {
      return await getObjectBuffer(key)
    } catch (e) {
      const status = e && (e.status || e.statusCode)
      if (status !== 404) {
        console.warn('[media-blob] oss get failed, try local', key, e && e.message)
      }
    }
  }
  const local = resolveLocalPathForKey(key)
  if (local && fs.existsSync(local)) {
    return fs.promises.readFile(local)
  }
  const err = new Error('原图文件不存在')
  err.status = 404
  throw err
}

async function writeMediaBuffer(objectKey, buffer, options = {}) {
  const key = normalizeObjectKey(objectKey)
  if (!key) {
    const err = new Error('无效的媒体路径')
    err.status = 400
    throw err
  }
  const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  if (isOssEnabled()) {
    await putObject(key, body, {
      contentType: options.contentType || contentTypeForKey(key),
    })
    return { storage: 'oss', objectKey: key }
  }
  const local = resolveLocalPathForKey(key)
  if (!local) {
    const err = new Error('无法解析本地存储路径')
    err.status = 400
    throw err
  }
  fs.mkdirSync(path.dirname(local), { recursive: true })
  await fs.promises.writeFile(local, body)
  return { storage: 'local', objectKey: key, filePath: local }
}

async function materializeMediaFile(objectKey) {
  const key = normalizeObjectKey(objectKey)
  const local = resolveLocalPathForKey(key)
  if (local && fs.existsSync(local)) {
    return { filePath: local, cleanup: async () => {}, fromOss: false }
  }
  const buf = await readMediaBuffer(key)
  const ext = path.extname(key) || '.jpg'
  const tmp = path.join(
    os.tmpdir(),
    `zhejian-media-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`,
  )
  await fs.promises.writeFile(tmp, buf)
  return {
    filePath: tmp,
    fromOss: true,
    cleanup: async () => {
      try {
        await fs.promises.unlink(tmp)
      } catch (e) {
        /* ignore */
      }
    },
  }
}

async function signReadableUrlForObjectKey(objectKey) {
  const key = normalizeObjectKey(objectKey)
  if (!key || !isOssEnabled()) return ''
  const cfg = ossConfig()
  const isDesensitized = key.includes('/desensitized/')
  const expires = isDesensitized
    ? Number(cfg.desensitizedSignedUrlTtlSec || 86400)
    : Number(cfg.signedUrlTtlSec || 7200)
  return signObjectUrl(key, { expires })
}

function objectKeyFromPublicUrl(url) {
  return (
    parseDesensitizedObjectKeyFromPublicUrl(url) ||
    parseObjectKeyFromPublicUrl(url) ||
    ''
  )
}

module.exports = {
  normalizeObjectKey,
  resolveLocalPathForKey,
  mediaObjectExists,
  readMediaBuffer,
  writeMediaBuffer,
  materializeMediaFile,
  signReadableUrlForObjectKey,
  objectKeyFromPublicUrl,
  isOriginalUploadObjectKey,
  MEDIA_ROOT,
}
