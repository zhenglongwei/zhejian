const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadSharp } = require('../../lib/image-process')

/**
 * 检测与打码使用同一朝向像素图，避免 EXIF 方向与 API 坐标系不一致
 */
async function prepareOrientedWorkingCopy(sourcePath) {
  const sharp = loadSharp()
  if (!sharp) {
    const err = new Error('sharp 不可用')
    err.code = 'MASKER_NO_SHARP'
    throw err
  }
  const ext = path.extname(sourcePath).toLowerCase() || '.jpg'
  const buffer = await sharp(sourcePath).rotate().toBuffer()
  const meta = await sharp(buffer).metadata()
  const tmpPath = path.join(
    os.tmpdir(),
    `zhejian-mask-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
  )
  fs.writeFileSync(tmpPath, buffer)
  return {
    workingPath: tmpPath,
    width: meta.width || 0,
    height: meta.height || 0,
    cleanup() {
      try {
        fs.unlinkSync(tmpPath)
      } catch (_) {
        /* ignore */
      }
    },
  }
}

/** 仅给阿里云认隐私位置。相册原图与打码、识图不得用这份。 */
const PRIVACY_DETECT_MAX_EDGE = 1600

async function writePrivacyDetectJpeg(sourcePath) {
  const sharp = loadSharp()
  if (!sharp) {
    const err = new Error('sharp 不可用')
    err.code = 'MASKER_NO_SHARP'
    throw err
  }
  const buf = await sharp(sourcePath)
    .rotate()
    .resize({
      width: PRIVACY_DETECT_MAX_EDGE,
      height: PRIVACY_DETECT_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer()
  const meta = await sharp(buf).metadata()
  const tmpPath = path.join(
    os.tmpdir(),
    `zhejian-plate-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
  )
  fs.writeFileSync(tmpPath, buf)
  return {
    path: tmpPath,
    width: meta.width || 0,
    height: meta.height || 0,
    cleanup() {
      try {
        fs.unlinkSync(tmpPath)
      } catch (_) {
        /* ignore */
      }
    },
  }
}

module.exports = {
  prepareOrientedWorkingCopy,
  writePrivacyDetectJpeg,
  PRIVACY_DETECT_MAX_EDGE,
}
