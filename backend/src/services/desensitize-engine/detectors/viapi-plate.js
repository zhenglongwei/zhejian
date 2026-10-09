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

/** 录像角标 REC、单独数字等不是车牌 */
function looksLikeLicensePlate(raw) {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s·•.\-]/g, '')
  if (s.length < 5 || s.length > 10) return false
  if (/^(REC|LIVE|HD|FHD|UHD|4K|AI|VIP|NEW|OK)$/.test(s)) return false
  if (/^\d+$/.test(s)) return false
  return /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领A-Z]/.test(s) && /[A-Z0-9]{4,}/.test(s)
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
  if (!roi || typeof roi !== 'object') return null
  const raw = normalizeBoxCoords(
    roi.x ?? roi.X ?? roi.left ?? roi.Left,
    roi.y ?? roi.Y ?? roi.top ?? roi.Top,
    roi.w ?? roi.W ?? roi.width ?? roi.Width,
    roi.h ?? roi.H ?? roi.height ?? roi.Height,
    imageWidth,
    imageHeight
  )
  if (!raw) return null
  return boxFromLtwh(raw.left, raw.top, raw.width, raw.height, 'plate', 'viapi_roi')
}

function unwrapViapiData(data) {
  if (!data || typeof data !== 'object') return data
  if (data.plates || data.Plates) return data
  const nested = data.data || data.Data
  if (nested && (nested.plates || nested.Plates)) return nested
  return data
}

function listPlates(data) {
  const root = unwrapViapiData(data)
  const raw = root?.plates || root?.Plates
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object' && (raw.plateNumber || raw.PlateNumber)) return [raw]
  return []
}

function parsePositions(raw) {
  if (!raw) return null
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (Array.isArray(value)) {
    if (value.length >= 4 && typeof value[0] === 'number') {
      const points = []
      for (let i = 0; i + 1 < value.length; i += 2) {
        points.push({ x: value[i], y: value[i + 1] })
      }
      return points
    }
    return value
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value.X) && Array.isArray(value.Y)) {
      return value.X.map((x, i) => ({ x, y: value.Y[i] }))
    }
    if (Array.isArray(value.points)) return value.points
  }
  return null
}

function boxFromPlate(plate, imageWidth, imageHeight) {
  if (!plate) return { posBox: null, roiBox: null }
  const roi = plate.roi || plate.Roi
  const positions = parsePositions(plate.positions || plate.Positions)
  return {
    posBox: boxFromNormalizedPoints(positions, 'plate', 'viapi_pos', imageWidth, imageHeight),
    roiBox: boxFromRoi(roi, imageWidth, imageHeight),
  }
}

function parseViapiPlateBoxes(data, imageWidth = 0, imageHeight = 0) {
  const plates = listPlates(data).filter((p) =>
    looksLikeLicensePlate(p.plateNumber || p.PlateNumber),
  )
  const plateNumbers = plates
    .map((p) => String(p.plateNumber || p.PlateNumber || '').trim())
    .filter(Boolean)
  if (!plates.length) {
    return { boxes: [], plateNumbers: [], debug: [] }
  }

  const debug = []
  const boxes = []
  const withGeometry = plates.filter((plate) => {
    const { posBox, roiBox } = boxFromPlate(plate, imageWidth, imageHeight)
    return Boolean(posBox || roiBox)
  })
  const chosen = withGeometry.length
    ? [pickBestPlate(withGeometry)]
    : []

  chosen.forEach((plate) => {
    const { posBox, roiBox } = boxFromPlate(plate, imageWidth, imageHeight)
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
    if (posBox) boxes.push(posBox)
    else if (roiBox) boxes.push(roiBox)
  })

  return { boxes, plateNumbers, debug }
}

function hasViapiPlateText(data) {
  return listPlates(data).some((p) => looksLikeLicensePlate(p.plateNumber || p.PlateNumber))
}

function logViapiPlateMiss(data, parsed) {
  const plate = listPlates(data)[0] || null
  const roi = plate && (plate.roi || plate.Roi)
  const positions = plate && (plate.positions || plate.Positions)
  console.warn('[desensitize-engine] viapi plate text without box', {
    plateKeys: plate ? Object.keys(plate) : [],
    roiKeys: roi && typeof roi === 'object' ? Object.keys(roi) : [],
    positionsType: Array.isArray(positions) ? 'array' : typeof positions,
    positionsLen: Array.isArray(positions) ? positions.length : 0,
    plateCount: parsed.plateNumbers.length,
  })
}

function parseViapiResponse(resp, imageWidth, imageHeight, ocrSize = {}) {
  const body = resp?.body || resp
  const data = unwrapViapiData(body?.data || body?.Data)
  const parsed = parseViapiPlateBoxes(data, imageWidth, imageHeight)
  if (parsed.boxes.length) {
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
  } else if (hasViapiPlateText(data)) {
    logViapiPlateMiss(data, parsed)
  }
  return {
    boxes: parsed.boxes,
    plateNumbers: parsed.plateNumbers,
    plateTextFound: hasViapiPlateText(data),
    orgWidth: Number(ocrSize.width) || 0,
    orgHeight: Number(ocrSize.height) || 0,
  }
}

async function recognizePlateByUpload(client, runtime, imagePath) {
  const request = new RecognizeLicensePlateAdvanceRequest()
  request.imageURLObject = openImageReadable(imagePath)
  return client.recognizeLicensePlateAdvance(request, runtime)
}

function viapiErrorText(err) {
  return `${err && err.code ? err.code : ''} ${err && err.message ? err.message : ''}`
}

function isViapiThrottling(err) {
  const text = viapiErrorText(err)
  return /Throttling/i.test(text) || text.includes('限流')
}

function isNoPlateContent(err) {
  const text = viapiErrorText(err)
  return /InvalidImage\.Content/i.test(text) || text.includes('图片内容不合法')
}

function emptyPlateResult(ocrSize = {}) {
  return {
    boxes: [],
    plateNumbers: [],
    plateTextFound: false,
    orgWidth: Number(ocrSize.width) || 0,
    orgHeight: Number(ocrSize.height) || 0,
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let plateDetectChain = Promise.resolve()

function runPlateDetectExclusive(fn) {
  const run = plateDetectChain.then(fn, fn)
  plateDetectChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/**
 * 只上传缩小 JPEG（调用方已准备好）。禁止杭州桶 ImageURL。禁止上传相册原图。
 */
async function detectPlateViaViapi(imagePath, imageWidth = 0, imageHeight = 0) {
  return runPlateDetectExclusive(async () => {
    if (!imagePath) return emptyPlateResult()
    const ocrSize = { width: imageWidth, height: imageHeight }
    const client = getViapiOcrClient()
    const runtime = runtimeOptions()
    let lastErr = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const resp = await recognizePlateByUpload(client, runtime, imagePath)
        console.info('[desensitize-engine] viapi plate via jpeg', {
          width: imageWidth,
          height: imageHeight,
        })
        return parseViapiResponse(resp, imageWidth, imageHeight, ocrSize)
      } catch (err) {
        lastErr = err
        if (isNoPlateContent(err)) {
          return emptyPlateResult(ocrSize)
        }
        if (isViapiThrottling(err) && attempt < 2) {
          await sleep(400 * (attempt + 1))
          continue
        }
        break
      }
    }
    throw lastErr
  })
}

module.exports = {
  detectPlateViaViapi,
  parseViapiPlateBoxes,
  looksLikeLicensePlate,
}
