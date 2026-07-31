/**
 * B-MEDIA-04/05：上传后去 EXIF + 生成缩略图（依赖 sharp，缺失时跳过）
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const THUMB_MAX = 480

function loadSharp() {
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    return require('sharp')
  } catch (e) {
    return null
  }
}

function buildThumbPath(filePath) {
  const ext = path.extname(filePath)
  const base = filePath.slice(0, -ext.length)
  return `${base}_thumb${ext || '.jpg'}`
}

function buildThumbObjectKey(objectKey) {
  const normalized = String(objectKey || '').replace(/\\/g, '/')
  return normalized.replace(/(\.[^./]+)$/, '_thumb$1')
}

/**
 * @param {string} filePath 绝对路径
 * @returns {Promise<{ processed: boolean, width?: number, height?: number, thumbPath?: string, thumbObjectKey?: string, strippedBuffer?: Buffer, thumbBuffer?: Buffer }>}
 */
async function processUploadedImage(filePath, objectKey = '') {
  const sharp = loadSharp()
  if (!sharp || !filePath || !fs.existsSync(filePath)) {
    return { processed: false }
  }

  try {
    const input = sharp(filePath)
    const meta = await input.metadata()
    const stripped = await input.rotate().toBuffer()
    fs.writeFileSync(filePath, stripped)

    const thumbPath = buildThumbPath(filePath)
    const thumbBuffer = await sharp(stripped)
      .resize({
        width: THUMB_MAX,
        height: THUMB_MAX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
    fs.writeFileSync(thumbPath, thumbBuffer)

    return {
      processed: true,
      width: meta.width || null,
      height: meta.height || null,
      thumbPath,
      thumbObjectKey: objectKey ? buildThumbObjectKey(objectKey) : '',
      strippedBuffer: stripped,
      thumbBuffer,
    }
  } catch (e) {
    console.warn('[image-process] skip', e && e.message)
    return { processed: false }
  }
}

/**
 * 基于 Buffer 处理（OSS 直传 complete 场景）
 */
async function processUploadedImageBuffer(buffer, objectKey = '') {
  const sharp = loadSharp()
  if (!sharp || !buffer || !buffer.length) {
    return { processed: false }
  }
  try {
    const input = sharp(buffer)
    const meta = await input.metadata()
    const stripped = await input.rotate().toBuffer()
    const thumbBuffer = await sharp(stripped)
      .resize({
        width: THUMB_MAX,
        height: THUMB_MAX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
    return {
      processed: true,
      width: meta.width || null,
      height: meta.height || null,
      thumbObjectKey: objectKey ? buildThumbObjectKey(objectKey) : '',
      strippedBuffer: stripped,
      thumbBuffer,
    }
  } catch (e) {
    console.warn('[image-process] buffer skip', e && e.message)
    return { processed: false }
  }
}

/** 将 buffer 落到临时文件（脱敏引擎等需要路径时） */
async function writeTempImageFile(buffer, ext = '.jpg') {
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(String(ext).toLowerCase())
    ? String(ext).toLowerCase()
    : '.jpg'
  const tmp = path.join(
    os.tmpdir(),
    `zhejian-img-${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`,
  )
  await fs.promises.writeFile(tmp, buffer)
  return tmp
}

module.exports = {
  loadSharp,
  processUploadedImage,
  processUploadedImageBuffer,
  buildThumbObjectKey,
  writeTempImageFile,
}
