const fs = require('fs')
const path = require('path')
const { loadSharp } = require('../../lib/image-process')

function loadSharpModule() {
  return loadSharp()
}

/**
 * 马赛克必须先落地小图再放大。sharp 链式 resize(小).resize(大) 会被 libvips 优化掉，等于没打。
 */
async function buildMosaicRegion(sharp, sourcePath, left, top, w, h) {
  const mosaicW = Math.max(6, Math.floor(w / 12))
  const mosaicH = Math.max(6, Math.floor(h / 12))
  const small = await sharp(sourcePath)
    .extract({ left, top, width: w, height: h })
    .resize(mosaicW, mosaicH, { kernel: 'nearest' })
    .png()
    .toBuffer()
  return sharp(small).resize(w, h, { kernel: 'nearest' }).png().toBuffer()
}

/** 隐私区用实心灰块（车牌/人脸等）；细马赛克肉眼仍可辨、且旧链式实现会空打 */
async function buildSolidFill(sharp, w, h) {
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 72, g: 72, b: 72 },
    },
  })
    .png()
    .toBuffer()
}

async function buildBlurRegion(sharp, sourcePath, left, top, w, h) {
  const sigma = Math.max(4, Math.min(24, Math.floor(Math.min(w, h) / 8)))
  return sharp(sourcePath)
    .extract({ left, top, width: w, height: h })
    .blur(sigma)
    .png()
    .toBuffer()
}

const SOLID_PRIVACY_TYPES = new Set(['plate', 'face', 'vin', 'phone', 'name', 'document', 'mixed'])

function resolveBoxEffect(box, globalMode = 'mosaic') {
  const type = String((box && box.type) || '').toLowerCase()
  if (SOLID_PRIVACY_TYPES.has(type)) return 'solid'
  if (type === 'blur' || type === 'mosaic') return type
  return globalMode === 'blur' ? 'blur' : 'mosaic'
}

async function applyMosaicToImage(sourcePath, boxes, globalMode = 'mosaic') {
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
    const effect = resolveBoxEffect(box, globalMode)
    let region
    if (effect === 'solid') {
      region = await buildSolidFill(sharp, w, h)
    } else if (effect === 'blur') {
      region = await buildBlurRegion(sharp, sourcePath, left, top, w, h)
    } else {
      region = await buildMosaicRegion(sharp, sourcePath, left, top, w, h)
    }
    composites.push({ input: region, left, top, blend: 'over' })
  }

  let pipeline = sharp(sourcePath).composite(composites)
  if (isPng) return pipeline.png({ compressionLevel: 8 }).toBuffer()
  if (isWebp) return pipeline.webp({ quality: 90 }).toBuffer()
  return pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
}

async function writeMaskedImage(sourcePath, destPath, boxes, globalMode = 'mosaic') {
  const buffer = await applyMosaicToImage(sourcePath, boxes, globalMode)
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  fs.writeFileSync(destPath, buffer)
  return buffer
}

module.exports = {
  applyMosaicToImage,
  writeMaskedImage,
  resolveBoxEffect,
  SOLID_PRIVACY_TYPES,
}
