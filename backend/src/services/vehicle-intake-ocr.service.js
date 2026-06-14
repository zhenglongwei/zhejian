/**
 * 接车照片车牌 / VIN 识别 — A-MCH-11
 * 复用脱敏引擎同款 VIAPI 车牌 + OCR-API VIN/通用兜底
 */
const { RuntimeOptions } = require('@darabonba/typescript')
const Ocr = require('@alicloud/ocr-api20210707')
const { config } = require('../config')
const {
  getOcrClient,
  openImageReadable,
} = require('../lib/aliyun-clients')
const {
  parseObjectKeyFromPublicUrl,
  resolveObjectKeyFilePath,
  rewriteMediaUrlForCurrentBase,
  assertPersistentImageUrl,
} = require('../lib/media-storage')
const { maskPlate } = require('../utils/plate-mask')
const { detectPlateViaViapi } = require('./desensitize-engine/detectors/viapi-plate')
const {
  safeParseData,
  unwrapOcrRoot,
} = require('./desensitize-engine/parse-ocr')

const { RecognizeCarNumberRequest, RecognizeCarVinCodeRequest, RecognizeGeneralRequest } = Ocr

const PLATE_TEXT_RE = /[\u4e00-\u9fa5][A-Z][·\s]?[A-Z0-9]{4,6}/i
const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/i

function runtimeOptions() {
  return new RuntimeOptions({
    connectTimeout: config.desensitize.apiTimeoutMs,
    readTimeout: config.desensitize.apiTimeoutMs,
  })
}

function resolveImageSources(imageUrl) {
  const persistent = assertPersistentImageUrl(imageUrl)
  const publicUrl = rewriteMediaUrlForCurrentBase(persistent)
  const objectKey = parseObjectKeyFromPublicUrl(publicUrl)
  const imagePath = objectKey ? resolveObjectKeyFilePath(objectKey) : null
  return { publicUrl, imagePath }
}

function normalizePlate(value) {
  return String(value || '')
    .trim()
    .replace(/[\s·.]/g, '')
    .toUpperCase()
}

function normalizeVin(value) {
  const vin = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  return VIN_RE.test(vin) ? vin.match(VIN_RE)[0] : ''
}

function pickPlateFromText(text) {
  const raw = String(text || '').replace(/\s/g, '')
  if (!raw) return ''
  const match = raw.match(PLATE_TEXT_RE)
  return match ? normalizePlate(match[0]) : ''
}

function collectOcrTexts(data) {
  const parsed = unwrapOcrRoot(safeParseData(data))
  if (!parsed) return []
  const texts = []
  const kv = parsed.prism_keyValueInfo || parsed.prism_keyvalueinfo || []
  kv.forEach((item) => {
    texts.push(String(item.value || item.Value || ''))
    texts.push(String(item.key || item.Key || ''))
  })
  const words = parsed.prism_wordsInfo || parsed.prism_wordsinfo || []
  words.forEach((item) => {
    texts.push(String(item.word || item.Word || item.content || ''))
  })
  const info = parsed.info || parsed.data?.info || []
  ;(info || []).forEach((item) => {
    texts.push(String(item.value || ''))
  })
  return texts.filter(Boolean)
}

function extractPlateFromOcrData(data) {
  for (const text of collectOcrTexts(data)) {
    const plate = pickPlateFromText(text)
    if (plate) return plate
  }
  return ''
}

function extractVinFromOcrData(data) {
  for (const text of collectOcrTexts(data)) {
    const vin = normalizeVin(text)
    if (vin) return vin
  }
  return ''
}

async function ocrRecognize(RequestClass, method, imagePath, publicUrl) {
  const client = getOcrClient()
  const runtime = runtimeOptions()
  const withOptionsMethod = `${method}WithOptions`
  if (typeof client[withOptionsMethod] !== 'function') {
    const err = new Error(`OCR 方法不可用: ${withOptionsMethod}`)
    err.code = 'OCR_METHOD_MISSING'
    throw err
  }

  const attempts = []
  if (imagePath) attempts.push('body')
  if (publicUrl) attempts.push('url')

  let lastError = null
  for (const mode of attempts) {
    try {
      let request
      if (mode === 'body') {
        request = new RequestClass()
        request.body = openImageReadable(imagePath)
      } else {
        request = new RequestClass({ url: publicUrl })
      }
      const resp = await client[withOptionsMethod](request, runtime)
      const rawBody = resp?.body
      if (rawBody?.code && String(rawBody.code) !== '200') {
        const err = new Error(rawBody.message || `OCR ${method} 失败`)
        err.code = rawBody.code
        throw err
      }
      return rawBody?.data || ''
    } catch (err) {
      lastError = err
    }
  }
  if (lastError) throw lastError
  return ''
}

async function recognizePlate(imagePath, publicUrl) {
  if (imagePath) {
    try {
      const viapi = await detectPlateViaViapi(imagePath)
      const fromViapi = (viapi.plateNumbers || [])
        .map((item) => normalizePlate(item))
        .find(Boolean)
      if (fromViapi) {
        return { plate: fromViapi, provider: 'viapi' }
      }
    } catch (e) {
      console.warn('[vehicle-intake-ocr] viapi plate failed', e && e.message)
    }
  }

  try {
    const data = await ocrRecognize(
      RecognizeCarNumberRequest,
      'recognizeCarNumber',
      imagePath,
      publicUrl
    )
    const plate = extractPlateFromOcrData(data)
    if (plate) return { plate, provider: 'ocr-api' }
  } catch (e) {
    console.warn('[vehicle-intake-ocr] car number ocr failed', e && e.message)
  }

  try {
    const data = await ocrRecognize(
      RecognizeGeneralRequest,
      'recognizeGeneral',
      imagePath,
      publicUrl
    )
    const plate = extractPlateFromOcrData(data)
    if (plate) return { plate, provider: 'ocr-api-general' }
  } catch (e) {
    console.warn('[vehicle-intake-ocr] general plate ocr failed', e && e.message)
  }

  return { plate: '', provider: '' }
}

async function recognizeVin(imagePath, publicUrl) {
  try {
    const data = await ocrRecognize(
      RecognizeCarVinCodeRequest,
      'recognizeCarVinCode',
      imagePath,
      publicUrl
    )
    const vin = extractVinFromOcrData(data)
    if (vin) return { vin, provider: 'ocr-api-vin' }
  } catch (e) {
    console.warn('[vehicle-intake-ocr] vin ocr failed', e && e.message)
  }

  try {
    const data = await ocrRecognize(
      RecognizeGeneralRequest,
      'recognizeGeneral',
      imagePath,
      publicUrl
    )
    const vin = extractVinFromOcrData(data)
    if (vin) return { vin, provider: 'ocr-api-general' }
  } catch (e) {
    console.warn('[vehicle-intake-ocr] general vin ocr failed', e && e.message)
  }

  return { vin: '', provider: '' }
}

async function recognizeVehicleIntake(imageUrl) {
  const url = String(imageUrl || '').trim()
  if (!url) {
    const err = new Error('请先上传接车照片')
    err.status = 400
    throw err
  }

  const { publicUrl, imagePath } = resolveImageSources(url)
  if (!imagePath && !publicUrl) {
    const err = new Error('图片地址无效，请重新上传')
    err.status = 400
    throw err
  }

  const [plateResult, vinResult] = await Promise.all([
    recognizePlate(imagePath, publicUrl),
    recognizeVin(imagePath, publicUrl),
  ])

  const plate = plateResult.plate || ''
  const vin = vinResult.vin || ''
  const recognized = []
  if (plate) recognized.push('plate')
  if (vin) recognized.push('vin')

  if (!recognized.length) {
    const err = new Error('未识别到车牌或 VIN，请手动填写')
    err.status = 422
    throw err
  }

  const providers = [plateResult.provider, vinResult.provider].filter(Boolean)
  return {
    plate,
    plateDisplay: plate ? maskPlate(plate) : '',
    vin,
    recognized,
    provider: [...new Set(providers)].join('+') || 'unknown',
  }
}

module.exports = {
  recognizeVehicleIntake,
  normalizePlate,
  normalizeVin,
}
