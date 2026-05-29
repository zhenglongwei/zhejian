const fs = require('fs')
const path = require('path')
const { loadSharp } = require('../../lib/image-process')

function loadSharpModule() {
  return loadSharp()
}

async function applyMosaicToImage(sourcePath, boxes) {
  const sharp = loadSharpModule()
  if (!sharp) {
    const err = new Error('sharp 不可用，无法打码')
    err.code = 'MASKER_NO_SHARP'
    throw err
  }

  const input = sharp(sourcePath)
  const meta = await input.metadata()
  const width = meta.width || 0
  const height = meta.height || 0
  if (!width || !height) {
    const err = new Error('无法读取图片尺寸')
    err.code = 'MASKER_BAD_IMAGE'
    throw err
  }

  const ext = path.extname(sourcePath).toLowerCase()
  const isPng = ext === '.png'
  const isWebp = ext === '.webp'

  if (!boxes.length) {
    if (isPng) return sharp(sourcePath).png({ compressionLevel: 8 }).toBuffer()
    if (isWebp) return sharp(sourcePath).webp({ quality: 90 }).toBuffer()
    return sharp(sourcePath).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
  }

  const composites = []
  for (const box of boxes) {
    const left = Math.max(0, Math.min(Math.floor(box.left), width - 1))
    const top = Math.max(0, Math.min(Math.floor(box.top), height - 1))
    const w = Math.max(1, Math.min(Math.floor(box.width), width - left))
    const h = Math.max(1, Math.min(Math.floor(box.height), height - top))
    const mosaicW = Math.max(4, Math.floor(w / 10))
    const mosaicH = Math.max(4, Math.floor(h / 10))
    const region = await sharp(sourcePath)
      .extract({ left, top, width: w, height: h })
      .resize(mosaicW, mosaicH, { kernel: 'nearest' })
      .resize(w, h, { kernel: 'nearest' })
      .toBuffer()
    composites.push({ input: region, left, top })
  }

  let pipeline = sharp(sourcePath).composite(composites)
  if (isPng) return pipeline.png({ compressionLevel: 8 }).toBuffer()
  if (isWebp) return pipeline.webp({ quality: 90 }).toBuffer()
  return pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
}

async function writeMaskedImage(sourcePath, destPath, boxes) {
  const buffer = await applyMosaicToImage(sourcePath, boxes)
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  fs.writeFileSync(destPath, buffer)
  return buffer
}

module.exports = {
  applyMosaicToImage,
  writeMaskedImage,
}
