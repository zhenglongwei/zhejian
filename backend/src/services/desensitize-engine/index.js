const path = require('path')
const sharp = require('sharp')
const { config } = require('../../config')
const { mergeBoxes } = require('./bbox')
const { writeMaskedImage } = require('./masker')
const { detectSensitiveRegions } = require('./detectors/aliyun')
const { processImageDev, ENGINE_VERSION: DEV_ENGINE_VERSION } = require('./providers/dev')

const ENGINE_VERSION = 'aliyun-v1'

function scaleBoxes(boxes, ocrWidth, ocrHeight, imageWidth, imageHeight) {
  if (!ocrWidth || !ocrHeight || !imageWidth || !imageHeight) return boxes
  if (ocrWidth === imageWidth && ocrHeight === imageHeight) return boxes
  const sx = imageWidth / ocrWidth
  const sy = imageHeight / ocrHeight
  return boxes.map((b) => ({
    ...b,
    left: Math.round(b.left * sx),
    top: Math.round(b.top * sy),
    width: Math.max(1, Math.round(b.width * sx)),
    height: Math.max(1, Math.round(b.height * sy)),
  }))
}

function resolveRiskLevel({ riskTags, authFailed, maskError, needManual }) {
  if (authFailed || maskError) return 'forbidden'
  if (needManual) return 'high'
  if (!riskTags.length) return 'low'
  return 'medium'
}

async function getImageSize(imagePath) {
  const meta = await sharp(imagePath).metadata()
  return { width: meta.width || 0, height: meta.height || 0 }
}

async function processImageAliyun(sourcePath, destPath) {
  const detection = await detectSensitiveRegions(sourcePath)
  const { width, height } = await getImageSize(sourcePath)
  if (!width || !height) {
    const err = new Error('无法读取图片尺寸')
    err.code = 'BAD_IMAGE'
    throw err
  }

  const mergedBoxes = mergeBoxes(
    scaleBoxes(detection.boxes, detection.ocrWidth, detection.ocrHeight, width, height),
    width,
    height
  )
  let maskError = false
  let needManual = false

  if (detection.plateMaskMiss) {
    console.warn('[desensitize-engine] plate text detected but no mask box', { sourcePath })
    needManual = true
  }

  if (detection.riskTags.includes('plate') && !mergedBoxes.some((b) => b.type === 'plate')) {
    needManual = true
  }

  try {
    await writeMaskedImage(sourcePath, destPath, mergedBoxes)
  } catch (e) {
    maskError = true
    if (detection.riskTags.length) needManual = true
    throw e
  }

  if (detection.riskTags.length > 0 && detection.errors.length >= 2) {
    needManual = true
  }

  const riskLevel = resolveRiskLevel({
    riskTags: detection.riskTags,
    authFailed: false,
    maskError,
    needManual,
  })

  const taskStatus = needManual ? 'NEED_MANUAL' : 'SUCCESS'

  return {
    taskStatus,
    riskLevel,
    riskTags: detection.riskTags,
    detections: mergedBoxes.map((b) => ({
      type: b.type,
      left: b.left,
      top: b.top,
      width: b.width,
      height: b.height,
      source: b.source,
    })),
    engineVersion: ENGINE_VERSION,
    needManual,
    warnings: detection.errors,
  }
}

/**
 * @param {string} sourcePath
 * @param {string} destPath
 */
async function processImage(sourcePath, destPath) {
  const engine = config.desensitize.engine
  if (engine === 'dev') {
    return processImageDev(sourcePath, destPath)
  }
  if (engine === 'aliyun') {
    return processImageAliyun(sourcePath, destPath)
  }
  const err = new Error(`未知脱敏引擎: ${engine}`)
  err.code = 'UNKNOWN_ENGINE'
  throw err
}

module.exports = {
  ENGINE_VERSION,
  DEV_ENGINE_VERSION,
  processImage,
}
