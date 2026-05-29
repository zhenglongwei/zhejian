const { writeMaskedImage } = require('../masker')

const ENGINE_VERSION = 'dev-watermark-v1'

/**
 * 本地开发引擎：sharp 重编码 + 角标水印（非 copyFile）
 */
async function processImageDev(sourcePath, destPath) {
  const sharp = require('sharp')
  const meta = await sharp(sourcePath).metadata()
  const width = meta.width || 800
  const height = meta.height || 600
  const fontSize = Math.max(14, Math.floor(Math.min(width, height) / 24))
  const svg = Buffer.from(
    `<svg width="${width}" height="${height}">
      <text x="12" y="${fontSize + 8}" font-size="${fontSize}" fill="rgba(255,80,80,0.85)" font-family="sans-serif">DESENSITIZED</text>
    </svg>`
  )
  const ext = sourcePath.toLowerCase()
  let pipeline = sharp(sourcePath).composite([{ input: svg, top: 0, left: 0 }])
  if (ext.endsWith('.png')) pipeline = pipeline.png()
  else if (ext.endsWith('.webp')) pipeline = pipeline.webp({ quality: 90 })
  else pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true })
  const buffer = await pipeline.toBuffer()
  require('fs').writeFileSync(destPath, buffer)
  return {
    taskStatus: 'SUCCESS',
    riskLevel: 'low',
    riskTags: [],
    detections: [],
    engineVersion: ENGINE_VERSION,
    needManual: false,
  }
}

module.exports = {
  ENGINE_VERSION,
  processImageDev,
}
