const { RuntimeOptions } = require('@darabonba/typescript')
const ViapiOcr = require('@alicloud/ocr20191230')
const { config } = require('../../../config')
const { getViapiOcrClient, openImageReadable, viapiOcrEndpoint } = require('../../../lib/aliyun-clients')
const { boxFromLtwh, boxFromPoints } = require('../bbox')

const { RecognizeLicensePlateAdvanceRequest } = ViapiOcr

function runtimeOptions() {
  return new RuntimeOptions({
    connectTimeout: config.desensitize.apiTimeoutMs,
    readTimeout: config.desensitize.apiTimeoutMs,
  })
}

function normalizeBoxCoords(left, top, width, height, imageWidth, imageHeight) {
  const l = Number(left)
  const t = Number(top)
  const w = Number(width)
  const h = Number(height)
  if (![l, t, w, h].every(Number.isFinite)) {
    return null
  }
  const maxVal = Math.max(l + w, t + h, l, t, w, h)
  if (maxVal > 0 && maxVal <= 1 && imageWidth && imageHeight) {
    return {
      left: l * imageWidth,
      top: t * imageHeight,
      width: w * imageWidth,
      height: h * imageHeight,
    }
  }
  return { left: l, top: t, width: w, height: h }
}

function boxFromNormalizedPoints(points, type, source, imageWidth, imageHeight) {
  if (!Array.isArray(points) || points.length < 2) return null
  const coords = points
    .map((p) => ({
      x: Number(p.x ?? p.X),
      y: Number(p.y ?? p.Y),
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (coords.length < 2) return null

  const maxVal = Math.max(...coords.flatMap((p) => [p.x, p.y]))
  if (maxVal > 0 && maxVal <= 1 && imageWidth && imageHeight) {
    return boxFromPoints(
      coords.map((p) => ({ x: p.x * imageWidth, y: p.y * imageHeight })),
      type,
      source
    )
  }
  return boxFromPoints(coords, type, source)
}

function pickBestPlate(plates) {
  if (!plates.length) return null
  let best = plates[0]
  let bestConf = Number(best.confidence ?? best.Confidence ?? 0)
  plates.forEach((plate) => {
    const conf = Number(plate.confidence ?? plate.Confidence ?? 0)
    if (conf >= bestConf) {
      best = plate
      bestConf = conf
    }
  })
  return best
}

function boxFromRoi(roi, imageWidth, imageHeight) {
  if (!roi) return null
  const raw = normalizeBoxCoords(
    roi.x ?? roi.X ?? roi.left,
    roi.y ?? roi.Y ?? roi.top,
    roi.w ?? roi.W ?? roi.width,
    roi.h ?? roi.H ?? roi.height,
    imageWidth,
    imageHeight
  )
  if (!raw) return null
  return boxFromLtwh(raw.left, raw.top, raw.width, raw.height, 'plate', 'viapi_roi')
}

function parseViapiPlateBoxes(data, imageWidth = 0, imageHeight = 0) {
  const plates = data?.plates || data?.Plates || []
  const plateNumbers = plates
    .map((p) => String(p.plateNumber || p.PlateNumber || '').trim())
    .filter(Boolean)
  if (!plates.length) {
    return { boxes: [], plateNumbers: [], debug: [] }
  }

  const best = pickBestPlate(plates)
  const debug = []
  const roi = best?.roi || best?.Roi
  const positions = best?.positions || best?.Positions || []
  const posBox = boxFromNormalizedPoints(positions, 'plate', 'viapi_pos', imageWidth, imageHeight)
  const roiBox = boxFromRoi(roi, imageWidth, imageHeight)

  if (roiBox) {
    debug.push({
      source: 'viapi_roi',
      left: roiBox.left,
      top: roiBox.top,
      width: roiBox.width,
      height: roiBox.height,
    })
  }
  if (posBox) {
    debug.push({
      source: 'viapi_pos',
      left: posBox.left,
      top: posBox.top,
      width: posBox.width,
      height: posBox.height,
    })
  }

  // 官方示例中 Positions 四角才是车牌真实区域，Roi 常偏移，打码必须用 Positions
  const boxes = []
  if (posBox) boxes.push(posBox)
  else if (roiBox) boxes.push(roiBox)

  return { boxes, plateNumbers, debug }
}

function hasViapiPlateText(data) {
  const plates = data?.plates || data?.Plates || []
  return plates.some((p) => String(p.plateNumber || p.PlateNumber || '').trim())
}

/**
 * VIAPI 车牌识别（ocr.cn-shanghai.aliyuncs.com），需 AliyunVIAPIFullAccess
 */
async function detectPlateViaViapi(imagePath, imageWidth = 0, imageHeight = 0) {
  const client = getViapiOcrClient()
  const runtime = runtimeOptions()
  const request = new RecognizeLicensePlateAdvanceRequest()
  request.imageURLObject = openImageReadable(imagePath)
  const resp = await client.recognizeLicensePlateAdvance(request, runtime)
  const data = resp?.body?.data || resp?.body?.Data
  const parsed = parseViapiPlateBoxes(data, imageWidth, imageHeight)
  console.info('[desensitize-engine] viapi plate ok', {
    endpoint: viapiOcrEndpoint(),
    count: parsed.boxes.length,
    plateNumbers: parsed.plateNumbers.slice(0, 3),
    candidates: parsed.debug,
    picked: parsed.boxes.map((b) => ({
      source: b.source,
      left: b.left,
      top: b.top,
      width: b.width,
      height: b.height,
    })),
  })
  return {
    boxes: parsed.boxes,
    plateNumbers: parsed.plateNumbers,
    plateTextFound: hasViapiPlateText(data),
    orgWidth: 0,
    orgHeight: 0,
  }
}

module.exports = {
  detectPlateViaViapi,
  parseViapiPlateBoxes,
}
