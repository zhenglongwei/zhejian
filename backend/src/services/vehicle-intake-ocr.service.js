/**
 * 接车照片车牌 / VIN 识别 — A-MCH-11
 * 车牌：VIAPI LicensePlate（ocr.cn-shanghai，ECS 可达）
 * VIN：优先 VIAPI RecognizeVINCode（同 endpoint）；ocr-api 仅作兜底（部分 ECS NXDOMAIN）
 */
const { RuntimeOptions } = require('@darabonba/typescript')
const Ocr = require('@alicloud/ocr-api20210707')
const ViapiOcr = require('@alicloud/ocr20191230')
const { config } = require('../config')
const {
  getOcrClient,
  getViapiOcrClient,
  openImageReadable,
  viapiOcrEndpoint,
} = require('../lib/aliyun-clients')
const {
  parseObjectKeyFromPublicUrl,
  rewriteMediaUrlForCurrentBase,
  assertPersistentImageUrl,
} = require('../lib/media-storage')
const { materializeMediaFile, objectKeyFromPublicUrl } = require('../lib/media-blob')
const { isOssEnabled, signObjectUrl, ossConfig } = require('../lib/oss-client')
const { maskPlate } = require('../utils/plate-mask')
const { detectPlateViaViapi } = require('./desensitize-engine/detectors/viapi-plate')
const {
  safeParseData,
  unwrapOcrRoot,
} = require('./desensitize-engine/parse-ocr')

const { RecognizeCarNumberRequest, RecognizeCarVinCodeRequest, RecognizeGeneralRequest } = Ocr
const { RecognizeVINCodeAdvanceRequest, RecognizeCharacterAdvanceRequest } = ViapiOcr

const PLATE_TEXT_RE = /[\u4e00-\u9fa5][A-Z][·\s]?[A-Z0-9]{4,6}/i
const VIN_RE = /[A-HJ-NPR-Z0-9]{17}/i

function runtimeOptions() {
  return new RuntimeOptions({
    connectTimeout: config.desensitize.apiTimeoutMs,
    readTimeout: config.desensitize.apiTimeoutMs,
  })
}

function normalizeMode(mode) {
  const value = String(mode || 'auto').trim().toLowerCase()
  if (value === 'plate' || value === 'vin') return value
  return 'auto'
}

async function resolveImageSources(imageUrl) {
  const persistent = assertPersistentImageUrl(imageUrl)
  const publicUrl = rewriteMediaUrlForCurrentBase(persistent)
  const objectKey = objectKeyFromPublicUrl(publicUrl) || parseObjectKeyFromPublicUrl(publicUrl)
  let imagePath = null
  let cleanup = async () => {}
  if (objectKey) {
    try {
      const materialized = await materializeMediaFile(objectKey)
      imagePath = materialized.filePath
      cleanup = materialized.cleanup || cleanup
    } catch (e) {
      imagePath = null
    }
  }
  let readableUrl = publicUrl
  if (objectKey && isOssEnabled()) {
    try {
      readableUrl = await signObjectUrl(objectKey, {
        expires: Number((ossConfig() && ossConfig().signedUrlTtlSec) || 7200),
      })
    } catch (e) {
      /* keep publicUrl */
    }
  }
  return { publicUrl: readableUrl, imagePath, cleanup }
}

function normalizePlate(value) {
  return String(value || '')
    .trim()
    .replace(/[\s·.]/g, '')
    .toUpperCase()
}

function normalizeVin(value) {
  const raw = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-]/g, '')
  if (!raw) return ''
  const match = raw.match(VIN_RE)
  return match ? match[0] : ''
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
  const texts = collectOcrTexts(data)
  for (const text of texts) {
    const vin = normalizeVin(text)
    if (vin) return vin
  }
  return normalizeVin(texts.join(' '))
}

function extractVinFromViapiVinData(data) {
  if (!data || typeof data !== 'object') return ''
  return normalizeVin(data.vinCode || data.VinCode || data.vin || data.VIN || '')
}

function extractVinFromViapiCharacterData(data) {
  if (!data || typeof data !== 'object') return ''
  const results = data.results || data.Results || []
  const texts = []
  ;(results || []).forEach((item) => {
    texts.push(String(item.text || item.Text || ''))
  })
  if (data.content || data.Content) {
    texts.push(String(data.content || data.Content))
  }
  for (const text of texts) {
    const vin = normalizeVin(text)
    if (vin) return vin
  }
  return normalizeVin(texts.join(' '))
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
  for (const attempt of attempts) {
    try {
      let request
      if (attempt === 'body') {
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

async function recognizeVinViaViapi(imagePath) {
  if (!imagePath) return { vin: '', provider: '' }
  const client = getViapiOcrClient()
  const runtime = runtimeOptions()
  if (typeof client.recognizeVINCodeAdvance !== 'function' || !RecognizeVINCodeAdvanceRequest) {
    const err = new Error('VIAPI VIN 识别不可用')
    err.code = 'VIAPI_VIN_UNAVAILABLE'
    throw err
  }
  const request = new RecognizeVINCodeAdvanceRequest()
  request.imageURLObject = openImageReadable(imagePath)
  const resp = await client.recognizeVINCodeAdvance(request, runtime)
  const data = resp?.body?.data || resp?.body?.Data || {}
  const vin = extractVinFromViapiVinData(data)
  console.info('[vehicle-intake-ocr] viapi vin ok', {
    endpoint: viapiOcrEndpoint(),
    hasVin: Boolean(vin),
  })
  return { vin, provider: vin ? 'viapi-vin' : '' }
}

function collectViapiCharacterTexts(data) {
  if (!data || typeof data !== 'object') return []
  const results = data.results || data.Results || []
  const texts = []
  ;(results || []).forEach((item) => {
    texts.push(String(item.text || item.Text || ''))
  })
  if (data.content || data.Content) {
    texts.push(String(data.content || data.Content))
  }
  return texts.filter(Boolean)
}

/** 从车辆铭牌 OCR 文本提取品牌/年款/发动机等（VIN 云解析失败时的兜底） */
function parseNameplateVehicleHints(texts = []) {
  const joined = (texts || []).join('\n')
  if (!joined.trim()) return {}
  const pickLabel = (labels) => {
    for (const label of labels) {
      const re = new RegExp(
        `${label}\\s*[:：]?\\s*([\\u4e00-\\u9fa5A-Za-z0-9\\-/.]+)`,
        'i'
      )
      const match = joined.match(re)
      if (match && match[1]) return String(match[1]).trim()
    }
    return ''
  }
  const brand = pickLabel(['品牌', '商标'])
  const chassisCode = pickLabel(['整车型号', '车辆型号', '型号'])
  const engineModel = pickLabel(['发动机型号'])
  const displacementRaw = pickLabel(['发动机排量', '排量'])
  const dateRaw = pickLabel(['制造年月', '出厂日期', '生产日期'])
  const manufacturer = pickLabel(['制造厂', '生产企业', '公司'])
  let modelYear = ''
  if (dateRaw) {
    const year = dateRaw.match(/(19|20)\d{2}/)
    if (year) modelYear = year[0]
  }
  const vehicle = {}
  if (brand) vehicle.brand = brand
  // 铭牌常无独立「车系」；用品牌占位，避免后续强制手填双空
  if (brand) vehicle.series = brand
  if (modelYear) vehicle.modelYear = modelYear
  if (chassisCode) vehicle.chassisCode = chassisCode
  if (engineModel) vehicle.engineModel = engineModel
  if (displacementRaw) vehicle.displacement = displacementRaw
  if (manufacturer && !vehicle.brand) vehicle.brand = manufacturer
  return vehicle
}

async function recognizeVinViaViapiCharacter(imagePath) {
  if (!imagePath) return { vin: '', provider: '', vehicleHints: {}, texts: [] }
  const client = getViapiOcrClient()
  const runtime = runtimeOptions()
  if (typeof client.recognizeCharacterAdvance !== 'function' || !RecognizeCharacterAdvanceRequest) {
    return { vin: '', provider: '', vehicleHints: {}, texts: [] }
  }
  const request = new RecognizeCharacterAdvanceRequest()
  request.imageURLObject = openImageReadable(imagePath)
  request.minHeight = 10
  request.outputProbability = false
  const resp = await client.recognizeCharacterAdvance(request, runtime)
  const data = resp?.body?.data || resp?.body?.Data || {}
  const texts = collectViapiCharacterTexts(data)
  const vin = extractVinFromViapiCharacterData(data) || normalizeVin(texts.join(' '))
  const vehicleHints = parseNameplateVehicleHints(texts)
  if (vin || Object.keys(vehicleHints).length) {
    console.info('[vehicle-intake-ocr] viapi character nameplate ok', {
      endpoint: viapiOcrEndpoint(),
      hasVin: Boolean(vin),
      hintKeys: Object.keys(vehicleHints),
    })
  }
  return {
    vin,
    provider: vin ? 'viapi-character' : '',
    vehicleHints,
    texts,
  }
}

async function recognizeVin(imagePath, publicUrl, options = {}) {
  const wantHints = options.withNameplateHints !== false
  let vehicleHints = {}
  let vin = ''
  let provider = ''

  if (imagePath) {
    try {
      const viaViapi = await recognizeVinViaViapi(imagePath)
      if (viaViapi.vin) {
        vin = viaViapi.vin
        provider = viaViapi.provider
      }
    } catch (e) {
      console.warn('[vehicle-intake-ocr] viapi vin failed', e && e.message)
    }
  }

  if (!vin) {
    try {
      const data = await ocrRecognize(
        RecognizeCarVinCodeRequest,
        'recognizeCarVinCode',
        imagePath,
        publicUrl
      )
      const fromOcr = extractVinFromOcrData(data) || normalizeVin(typeof data === 'string' ? data : '')
      if (fromOcr) {
        vin = fromOcr
        provider = 'ocr-api-vin'
      }
    } catch (e) {
      console.warn('[vehicle-intake-ocr] vin ocr failed', e && e.message)
    }
  }

  if (imagePath && (wantHints || !vin)) {
    try {
      const viaChar = await recognizeVinViaViapiCharacter(imagePath)
      if (!vin && viaChar.vin) {
        vin = viaChar.vin
        provider = viaChar.provider
      }
      if (viaChar.vehicleHints && Object.keys(viaChar.vehicleHints).length) {
        vehicleHints = viaChar.vehicleHints
      }
    } catch (e) {
      console.warn('[vehicle-intake-ocr] viapi character vin failed', e && e.message)
    }
  }

  if (!vin) {
    try {
      const data = await ocrRecognize(
        RecognizeGeneralRequest,
        'recognizeGeneral',
        imagePath,
        publicUrl
      )
      const fromGeneral = extractVinFromOcrData(data)
      if (fromGeneral) {
        vin = fromGeneral
        provider = 'ocr-api-general'
      }
    } catch (e) {
      console.warn('[vehicle-intake-ocr] general vin ocr failed', e && e.message)
    }
  }

  return { vin, provider, vehicleHints }
}

async function recognizeVehicleIntake(imageUrl, options = {}) {
  const url = String(imageUrl || '').trim()
  if (!url) {
    const err = new Error('请先上传接车照片')
    err.status = 400
    throw err
  }

  const mode = normalizeMode(options.mode || options.prefer)
  const { publicUrl, imagePath, cleanup } = await resolveImageSources(url)
  if (!imagePath && !publicUrl) {
    const err = new Error('图片地址无效，请重新上传')
    err.status = 400
    throw err
  }

  try {
    let plateResult = { plate: '', provider: '' }
    let vinResult = { vin: '', provider: '' }

    if (mode === 'plate') {
      plateResult = await recognizePlate(imagePath, publicUrl)
    } else if (mode === 'vin') {
      vinResult = await recognizeVin(imagePath, publicUrl, { withNameplateHints: true })
    } else {
      ;[plateResult, vinResult] = await Promise.all([
        recognizePlate(imagePath, publicUrl),
        recognizeVin(imagePath, publicUrl, { withNameplateHints: true }),
      ])
    }

    const plate = plateResult.plate || ''
    const vin = vinResult.vin || ''
    const vehicleHints = (vinResult && vinResult.vehicleHints) || {}
    const recognized = []
    if (plate) recognized.push('plate')
    if (vin) recognized.push('vin')

    if (!recognized.length) {
      const err = new Error(
        mode === 'vin'
          ? '未识别到车架号，请换一张更清晰的铭牌照片或手动填写'
          : mode === 'plate'
            ? '未识别到车牌，请换一张更清晰的车牌照片或手动填写'
            : '未识别到车牌或 VIN，请手动填写'
      )
      err.status = 422
      throw err
    }

    if (mode === 'vin' && !vin) {
      const err = new Error('未识别到车架号，请换一张更清晰的铭牌照片或手动填写')
      err.status = 422
      throw err
    }
    if (mode === 'plate' && !plate) {
      const err = new Error('未识别到车牌，请换一张更清晰的车牌照片或手动填写')
      err.status = 422
      throw err
    }

    const providers = [plateResult.provider, vinResult.provider].filter(Boolean)
    return {
      plate,
      plateDisplay: plate ? maskPlate(plate) : '',
      vin,
      vehicleHints,
      recognized,
      mode,
      provider: [...new Set(providers)].join('+') || 'unknown',
    }
  } finally {
    if (cleanup) await cleanup()
  }
}

module.exports = {
  recognizeVehicleIntake,
  normalizePlate,
  normalizeVin,
}
