const { config } = require('../../config')
const { mergeBoxes } = require('./bbox')
const { writeMaskedImage } = require('./masker')
const { detectSensitiveRegions } = require('./detectors/aliyun')
const { prepareOrientedWorkingCopy, writePrivacyDetectJpeg } = require('./oriented')
const { detectPlateViaViapi } = require('./detectors/viapi-plate')
const { processImageDev, ENGINE_VERSION: DEV_ENGINE_VERSION } = require('./providers/dev')

const ENGINE_VERSION = 'aliyun-v9'

function filterBogusFaceBoxes(boxes, imageWidth, imageHeight) {
  if (!imageWidth || !imageHeight) return boxes
  const imageArea = imageWidth * imageHeight
  return boxes.filter((box) => {
    if (box.type !== 'face') return true
    const ratio = (box.width * box.height) / imageArea
    // 人脸框占画面过大多半是误检（整图当脸），丢掉以免整张糊掉或漏真脸
    if (ratio >= 0.55) {
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
  if (needManual) return 'high'
  if (maskError) return 'forbidden'
  if (!riskTags.length) return 'low'
  if (authFailed) return 'high'
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

    const scaledBoxes = scaleBoxes(
      detection.boxes,
      detection.ocrWidth,
      detection.ocrHeight,
      width,
      height,
    )
    const filteredBoxes = filterBogusFaceBoxes(scaledBoxes, width, height)
    const mergedBoxes = mergeBoxes(filteredBoxes, width, height)
    const riskTags = riskTagsFromBoxes(mergedBoxes)
    let maskError = false
    let needManual = false

    if (detection.plateMaskMiss) {
      console.warn('[desensitize-engine] plate text detected but no mask box', {
        imageSize: { width, height },
        plateNumbers: (detection.plateNumbers || []).slice(0, 3),
      })
      // 套不出框不当整张失败：零件误报也能进检测。公开闸仍看 plateMaskMiss。
      if (detection.ocrAuthFailed) needManual = true
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

    const noSensitiveContent = !mergedBoxes.length && !riskTags.length

    if (mergedBoxes.length) {
      try {
        await writeMaskedImage(oriented.workingPath, destPath, mergedBoxes)
      } catch (e) {
        maskError = true
        if (riskTags.length) needManual = true
        throw e
      }
    }
    // 无敏感：不写 destPath 产物；上层记 ok_no_privacy，禁止复制原图冒充打码图

    if (noSensitiveContent) {
      if (detection.ocrAuthFailed || detection.ocrNetworkFailed) {
        console.info('[desensitize-engine] clean pass-through despite ocr issues', {
          ocrAuthFailed: detection.ocrAuthFailed,
          ocrNetworkFailed: detection.ocrNetworkFailed,
          errors: (detection.errors || []).slice(0, 3),
        })
      }
      needManual = false
    } else if (mergedBoxes.length && !maskError) {
      needManual = false
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
const MASK_KINDS = {
  phone: 'phone',
  手机号: 'phone',
  name: 'name',
  姓名: 'name',
  document: 'document',
  证件: 'document',
  face: 'face',
  人脸: 'face',
  plate: 'plate',
  车牌: 'plate',
  vin: 'vin',
  车架号: 'vin',
}

function asRatioBox(box, width, height) {
  const rawKind = String((box && (box.kind || box.type)) || '').trim().toLowerCase()
  const kind = MASK_KINDS[rawKind]
  if (!kind) return null
  let left = Number(box.left)
  let top = Number(box.top)
  let boxWidth = Number(box.width)
  let boxHeight = Number(box.height)
  if (![left, top, boxWidth, boxHeight].every((n) => Number.isFinite(n) && n >= 0)) return null
  const normalized = left <= 1 && top <= 1 && boxWidth <= 1 && boxHeight <= 1
  if (normalized) {
    left *= width
    top *= height
    boxWidth *= width
    boxHeight *= height
  }
  left = Math.max(0, Math.min(Math.round(left), width - 1))
  top = Math.max(0, Math.min(Math.round(top), height - 1))
  boxWidth = Math.max(1, Math.min(Math.round(boxWidth), width - left))
  boxHeight = Math.max(1, Math.min(Math.round(boxHeight), height - top))
  if (boxWidth < 4 || boxHeight < 4) return null
  return { type: kind, left, top, width: boxWidth, height: boxHeight, source: 'model' }
}

function plateAuthFailed(err) {
  const text = `${err && err.code ? err.code : ''} ${err && err.message ? err.message : ''}`
  return /auth|forbidden|InvalidAccessKey|not authorized|NoPermission/i.test(text)
}

/**
 * 模型给出的区域照打。车牌没有框时再认一次并打实心灰块。
 * 认到字却套不出框，或识别接口失败时，不得把原图标成已脱敏。
 */
async function processImage(sourcePath, destPath, options = {}) {
  const engine = config.desensitize.engine
  if (engine === 'dev') {
    return processImageDev(sourcePath, destPath)
  }

  const oriented = await prepareOrientedWorkingCopy(sourcePath)
  try {
    const { width, height } = oriented
    const declared = (Array.isArray(options.boxes) ? options.boxes : [])
      .map((box) => asRatioBox(box, width, height))
      .filter(Boolean)
    let plateBoxes = []
    let faceBoxes = []
    let plateMiss = false
    let authFailed = false
    const needPlate = !declared.some((box) => box.type === 'plate')
    const needFace = !declared.some((box) => box.type === 'face')
    if (needPlate || needFace) {
      const jpeg = await writePrivacyDetectJpeg(oriented.workingPath)
      try {
        if (needPlate) {
          try {
            const viapi = await detectPlateViaViapi(jpeg.path, jpeg.width, jpeg.height)
            plateBoxes = scaleBoxes(viapi.boxes || [], jpeg.width, jpeg.height, width, height)
            plateMiss = Boolean(viapi.plateTextFound && !plateBoxes.length)
          } catch (err) {
            plateMiss = true
            authFailed = plateAuthFailed(err)
            console.warn(
              '[desensitize-engine] plate fallback failed',
              String((err && err.message) || err || '').slice(0, 160),
            )
          }
        }
        // 与车牌一样：模型没给脸框时再认一次，避免工单图空 masks 误标无敏感出原图
        if (needFace) {
          try {
            const { detectFaces } = require('./detectors/aliyun')
            const faces = await detectFaces(jpeg.path)
            faceBoxes = filterBogusFaceBoxes(
              scaleBoxes(faces || [], jpeg.width, jpeg.height, width, height),
              width,
              height,
            )
          } catch (err) {
            console.warn(
              '[desensitize-engine] face fallback failed',
              String((err && err.message) || err || '').slice(0, 160),
            )
          }
        }
      } finally {
        jpeg.cleanup()
      }
    }

    const merged = mergeBoxes(declared.concat(plateBoxes).concat(faceBoxes), width, height)
    const hasPlate = merged.some((box) => box.type === 'plate' || box.type === 'mixed')
    if ((plateMiss || authFailed) && !hasPlate) {
      return {
        taskStatus: 'NEED_MANUAL',
        riskLevel: 'high',
        riskTags: ['plate'],
        detections: merged,
        engineVersion: ENGINE_VERSION,
        needManual: true,
        warnings: [authFailed ? 'plate-auth' : 'plate-miss'],
      }
    }

    if (merged.length) {
      console.info('[desensitize-engine] mask boxes', {
        imageSize: { width, height },
        boxes: merged.map((box) => ({
          type: box.type,
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          source: box.source,
        })),
      })
    }

    await writeMaskedImage(oriented.workingPath, destPath, merged)
    const riskTags = []
    merged.forEach((box) => {
      if (box.type === 'mixed' || box.type === 'plate') {
        if (!riskTags.includes('plate')) riskTags.push('plate')
        return
      }
      if (box.type && !riskTags.includes(box.type)) riskTags.push(box.type)
    })
    return {
      taskStatus: 'SUCCESS',
      riskLevel: riskTags.length ? 'medium' : 'low',
      riskTags,
      detections: merged,
      engineVersion: ENGINE_VERSION,
      needManual: false,
      warnings: [],
    }
  } finally {
    oriented.cleanup()
  }
}

module.exports = {
  ENGINE_VERSION,
  DEV_ENGINE_VERSION,
  processImage,
}
