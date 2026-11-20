const { config } = require('../../config')
const { mergeBoxes } = require('./bbox')
const { writeMaskedImage } = require('./masker')
const { prepareOrientedWorkingCopy } = require('./oriented')
const { processImageDev, ENGINE_VERSION: DEV_ENGINE_VERSION } = require('./providers/dev')

const ENGINE_VERSION = 'aliyun-v9'

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

/**
 * 敏感区只认大模型给的框。
 * 不给框就不贴码：漏框由商家确认那道闸兜，不再花一次识别费去猜模型漏掉的东西。
 * @param {{ boxes?: object[] }} [options]
 */
async function processImage(sourcePath, destPath, options = {}) {
  const engine = config.desensitize.engine
  if (engine === 'dev') {
    return processImageDev(sourcePath, destPath)
  }

  const oriented = await prepareOrientedWorkingCopy(sourcePath)
  try {
    const { width, height } = oriented
    const merged = mergeBoxes(
      (Array.isArray(options.boxes) ? options.boxes : [])
        .map((box) => asRatioBox(box, width, height))
        .filter(Boolean),
      width,
      height
    )

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
