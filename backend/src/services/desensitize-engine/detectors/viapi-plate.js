const { RuntimeOptions } = require('@darabonba/typescript')
const ViapiOcr = require('@alicloud/ocr20191230')
const { config } = require('../../../config')
const { getViapiOcrClient, openImageReadable, viapiOcrEndpoint } = require('../../../lib/aliyun-clients')
const { boxFromLtwh, boxFromPoints } = require('../bbox')

const { RecognizeLicensePlateAdvanceRequest, RecognizeLicensePlateRequest } = ViapiOcr

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
  const plates = (data?.plates || data?.Plates || []).filter((p) =>
    looksLikeLicensePlate(p.plateNumber || p.PlateNumber),
  )
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
  return plates.some((p) => looksLikeLicensePlate(p.plateNumber || p.PlateNumber))
}

function stripUrlQuery(url) {
  const raw = String(url || '').trim()
  const cut = raw.indexOf('?')
  return cut >= 0 ? raw.slice(0, cut) : raw
}

/** 阿里云需能公网 GET；内网/本机地址不可用。 */
function isAliyunFetchableImageUrl(url) {
  const raw = String(url || '').trim()
  if (!/^https?:\/\//i.test(raw)) return false
  try {
    const host = new URL(raw).hostname.toLowerCase()
    if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1') return false
    if (host.endsWith('.local')) return false
    if (/^(10|127|192\.168)\./.test(host)) return false
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false
    if (host.includes('-internal.aliyuncs.com')) return false
    return true
  } catch (_) {
    return false
  }
}

function parseViapiResponse(resp, imageWidth, imageHeight) {
  const data = resp?.body?.data || resp?.body?.Data
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
  }
  return {
    boxes: parsed.boxes,
    plateNumbers: parsed.plateNumbers,
    plateTextFound: hasViapiPlateText(data),
    orgWidth: 0,
    orgHeight: 0,
  }
}

async function recognizePlateByUrl(client, runtime, imageURL) {
  const request = new RecognizeLicensePlateRequest()
  request.imageURL = imageURL
  return client.recognizeLicensePlate(request, runtime)
}

async function recognizePlateByUpload(client, runtime, imagePath) {
  const request = new RecognizeLicensePlateAdvanceRequest()
  request.imageURLObject = openImageReadable(imagePath)
  return client.recognizeLicensePlateAdvance(request, runtime)
}

/**
 * VIAPI 车牌识别（ocr.cn-shanghai.aliyuncs.com），需 AliyunVIAPIFullAccess。
 * 优先让阿里云按公网地址拉图，避免本机再把原图传到上海。
 */
async function detectPlateViaViapi(imagePath, imageWidth = 0, imageHeight = 0, options = {}) {
  const client = getViapiOcrClient()
  const runtime = runtimeOptions()
  const imageURL = String((options && (options.imageURL || options.publicUrl)) || '').trim()
  if (isAliyunFetchableImageUrl(imageURL)) {
    try {
      const resp = await recognizePlateByUrl(client, runtime, imageURL)
      console.info('[desensitize-engine] viapi plate via url', stripUrlQuery(imageURL))
      return parseViapiResponse(resp, imageWidth, imageHeight)
    } catch (err) {
      console.warn(
        '[desensitize-engine] viapi plate url failed, upload file:',
        err.code || '',
        String(err.message || '').slice(0, 120),
      )
    }
  }
  const resp = await recognizePlateByUpload(client, runtime, imagePath)
  console.info('[desensitize-engine] viapi plate via upload')
  return parseViapiResponse(resp, imageWidth, imageHeight)
}

module.exports = {
  detectPlateViaViapi,
  parseViapiPlateBoxes,
  looksLikeLicensePlate,
  isAliyunFetchableImageUrl,
}
