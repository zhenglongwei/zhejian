const sharp = require('sharp')
const { config } = require('../../config')
const { mergeBoxes } = require('./bbox')
const { writeMaskedImage } = require('./masker')
const { detectSensitiveRegions } = require('./detectors/aliyun')
const { prepareOrientedWorkingCopy } = require('./oriented')
const { processImageDev, ENGINE_VERSION: DEV_ENGINE_VERSION } = require('./providers/dev')

const ENGINE_VERSION = 'aliyun-v7'

function filterBogusFaceBoxes(boxes, imageWidth, imageHeight) {
  if (!imageWidth || !imageHeight) return boxes
  const imageArea = imageWidth * imageHeight
  return boxes.filter((box) => {
    if (box.type !== 'face') return true
    const ratio = (box.width * box.height) / imageArea
    if (ratio >= 0.85) {
      console.warn('[desensitize-engine] drop bogus full-frame face box', { ratio })
      return false
    }
    return true
  })
}

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

function riskTagsFromBoxes(boxes) {
  const riskTags = new Set()
  boxes.forEach((box) => {
    if (box.type === 'face') riskTags.add('face')
    if (box.type === 'plate') riskTags.add('plate')
    if (box.type === 'vin') riskTags.add('vin')
    if (box.type === 'phone') riskTags.add('phone')
    if (box.type === 'document') riskTags.add('document')
    if (box.type === 'mixed') {
      riskTags.add('plate')
    }
  })
  return [...riskTags]
}

function resolveRiskLevel({ riskTags, authFailed, maskError, needManual }) {
  if (authFailed || maskError) return 'forbidden'
  if (needManual) return 'high'
  if (!riskTags.length) return 'low'
  return 'medium'
}

async function processImageAliyun(sourcePath, destPath, options = {}) {
  const oriented = await prepareOrientedWorkingCopy(sourcePath)
  try {
    const { width, height } = oriented
    if (!width || !height) {
      const err = new Error('无法读取图片尺寸')
      err.code = 'BAD_IMAGE'
      throw err
    }

    const detection = await detectSensitiveRegions(oriented.workingPath, {
      ...options,
      imageWidth: width,
      imageHeight: height,
    })

    const filteredBoxes = filterBogusFaceBoxes(detection.boxes, width, height)
    const mergedBoxes = mergeBoxes(
      scaleBoxes(filteredBoxes, detection.ocrWidth, detection.ocrHeight, width, height),
      width,
      height
    )
    const riskTags = riskTagsFromBoxes(mergedBoxes)
    let maskError = false
    let needManual = false

    if (detection.ocrAuthFailed) {
      console.warn('[desensitize-engine] ocr auth failed, mark need_manual', detection.errors)
      needManual = true
    }

    if (detection.plateMaskMiss) {
      console.warn('[desensitize-engine] plate text detected but no mask box', {
        sourcePath,
        imageSize: { width, height },
      })
      needManual = true
    }

    if (riskTags.includes('plate') && !mergedBoxes.some((b) => b.type === 'plate' || b.type === 'mixed')) {
      needManual = true
    }

    if (mergedBoxes.length) {
      console.info('[desensitize-engine] mask boxes', {
        imageSize: { width, height },
        boxes: mergedBoxes.map((b) => ({
          type: b.type,
          left: b.left,
          top: b.top,
          width: b.width,
          height: b.height,
          source: b.source,
        })),
      })
    }

    try {
      await writeMaskedImage(oriented.workingPath, destPath, mergedBoxes)
    } catch (e) {
      maskError = true
      if (riskTags.length) needManual = true
      throw e
    }

    if (riskTags.length > 0 && detection.errors.length >= 2) {
      needManual = true
    }

    if (detection.ocrAuthFailed && !mergedBoxes.some((b) => b.type === 'plate' || b.type === 'mixed')) {
      needManual = true
    }

    if (detection.ocrNetworkFailed && !mergedBoxes.some((b) => b.type === 'plate' || b.type === 'mixed')) {
      needManual = true
    }

    const riskLevel = resolveRiskLevel({
      riskTags,
      authFailed: detection.ocrAuthFailed,
      maskError,
      needManual,
    })

    const taskStatus = needManual ? 'NEED_MANUAL' : 'SUCCESS'

    return {
      taskStatus,
      riskLevel,
      riskTags,
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
  } finally {
    oriented.cleanup()
  }
}

/**
 * @param {string} sourcePath
 * @param {string} destPath
 * @param {{ publicUrl?: string }} [options]
 */
async function processImage(sourcePath, destPath, options = {}) {
  const engine = config.desensitize.engine
  if (engine === 'dev') {
    return processImageDev(sourcePath, destPath)
  }
  if (engine === 'aliyun') {
    return processImageAliyun(sourcePath, destPath, options)
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
