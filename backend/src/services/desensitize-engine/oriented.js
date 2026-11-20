const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadSharp } = require('../../lib/image-process')

/**
 * 贴码只用这份朝向矫正后的像素：模型给的 0–1 坐标要乘它的宽高，EXIF 旋转图才不会贴错位。
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

module.exports = {
  prepareOrientedWorkingCopy,
}
