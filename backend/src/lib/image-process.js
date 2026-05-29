/**
 * B-MEDIA-04/05：上传后去 EXIF + 生成缩略图（依赖 sharp，缺失时跳过）
 */
const fs = require('fs')
const path = require('path')

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
 * @returns {Promise<{ processed: boolean, width?: number, height?: number, thumbPath?: string, thumbObjectKey?: string }>}
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
    await sharp(stripped)
      .resize({
        width: THUMB_MAX,
        height: THUMB_MAX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(thumbPath)

    return {
      processed: true,
      width: meta.width || null,
      height: meta.height || null,
      thumbPath,
      thumbObjectKey: objectKey ? buildThumbObjectKey(objectKey) : '',
    }
  } catch (e) {
    console.warn('[image-process] skip', e && e.message)
    return { processed: false }
  }
}

module.exports = {
  loadSharp,
  processUploadedImage,
  buildThumbObjectKey,
}
