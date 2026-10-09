const { RuntimeOptions } = require('@darabonba/typescript')
const Ocr = require('@alicloud/ocr-api20210707')
const Facebody = require('@alicloud/facebody20191230')
const { config } = require('../../../config')
const { buildPublicMediaUrl } = require('../../../lib/media-storage')
const { getOcrClient, getFaceClient, openImageReadable } = require('../../../lib/aliyun-clients')
const { detectPlateViaViapi } = require('./viapi-plate')
const { writePrivacyDetectJpeg } = require('../oriented')
const { boxesFromFaceRectangles } = require('../bbox')
const {
  parsePlateResult,
  parseVinBoxes,
  parseGeneralSensitiveBoxes,
  safeParseData,
  unwrapOcrRoot,
} = require('../parse-ocr')

const {
  RecognizeCarNumberRequest,
  RecognizeCarVinCodeRequest,
  RecognizeGeneralRequest,
} = Ocr

const { DetectFaceAdvanceRequest } = Facebody

let ocrApiUnreachable = false

function isAuthError(err) {
  const code = String(err?.code || err?.data?.Code || '').toLowerCase()
  const msg = String(err?.message || '').toLowerCase()
  if (code === 'enoent' || msg.includes('enoent')) return false
  return (
    code.includes('nopermission') ||
    code.includes('invalidaccesskey') ||
    code.includes('invalidcredentials') ||
    code.includes('signature') ||
    code.includes('unauthorized') ||
    msg.includes('accesskey') ||
    msg.includes('forbidden') ||
    msg.includes('denied') ||
    msg.includes('not authorized') ||
    msg.includes('you are not authorized') ||
    msg.includes('权限不足') ||
    code === '403'
  )
}

/** 未识别到车牌/VIN/人脸等，视为空结果而非整图失败 */
function isBenignDetectError(err) {
  if (isAuthError(err)) return false
  const code = String(err?.code || err?.data?.Code || '').toLowerCase()
  const msg = String(err?.message || '').toLowerCase()
  return (
    code.includes('illegalimage') ||
    code.includes('noocrresult') ||
    code.includes('notfoundface') ||
    code.includes('notfound') ||
    code.includes('invalidimage') ||
    msg.includes('未识别') ||
    msg.includes('无识别') ||
    msg.includes('没找到') ||
    msg.includes('notfoundface') ||
    msg.includes('无法下载') ||
    msg.includes('download')
  )
}

function runtimeOptions() {
  return new RuntimeOptions({
    connectTimeout: config.desensitize.apiTimeoutMs,
    readTimeout: config.desensitize.apiTimeoutMs,
  })
}

function resolvePublicImageUrl(imagePath, publicUrl) {
  const raw = String(publicUrl || '').trim()
  if (raw) {
    if (/^https?:\/\//i.test(raw)) return raw
    if (raw.startsWith('/')) return `${config.publicBaseUrl}${raw}`
  }
  const normalized = String(imagePath || '').replace(/\\/g, '/')
  const match = normalized.match(/(uploads\/\d{4}\/\d{2}\/[a-f0-9]{32}\.(?:jpe?g|png|webp))/i)
  if (match) return buildPublicMediaUrl(match[1])
  return ''
}

function summarizeOcrPayload(data) {
  const parsed = unwrapOcrRoot(safeParseData(data))
  if (!parsed) return { kv: 0, info: 0, orgWidth: 0, orgHeight: 0, plateValue: '' }
  const kv = parsed.prism_keyValueInfo || parsed.prism_keyvalueinfo || []
  const info = parsed.info || []
  const plateValue = kv.find((item) => String(item.key || '').includes('车牌'))?.value || ''
  return {
    kv: kv.length,
    info: info.length,
    orgWidth: parsed.orgWidth || 0,
    orgHeight: parsed.orgHeight || 0,
    plateValue: String(plateValue).slice(0, 16),
  }
}

async function runDetector(name, fn) {
  try {
    return { boxes: await fn(), authFailed: false, error: '' }
  } catch (err) {
    if (isAuthError(err)) {
      return { boxes: [], authFailed: true, error: `${name}:${err.message || 'auth'}` }
    }
    if (isNetworkError(err) || isBenignDetectError(err)) {
      return { boxes: [], authFailed: false, error: '' }
    }
    console.warn(
      `[desensitize-engine] ${name}:`,
      err.code || '',
      String(err.message || '').slice(0, 120)
    )
    return { boxes: [], authFailed: false, error: `${name}:${err.message || 'failed'}` }
  }
}

async function detectFaces(imagePath) {
  const client = getFaceClient()
  const runtime = runtimeOptions()
  const request = new DetectFaceAdvanceRequest({
    imageURLObject: openImageReadable(imagePath),
    landmark: false,
    pose: false,
    quality: false,
    maxFaceNumber: config.desensitize.maxFaceNumber,
  })
  const resp = await client.detectFaceAdvance(request, runtime)
  const data = resp?.body?.data || resp?.body?.Data
  const rectangles = data?.faceRectangles || data?.FaceRectangles || []
  return boxesFromFaceRectangles(rectangles, 'face')
}

async function ocrRecognize(RequestClass, method, imagePath) {
  const client = getOcrClient()
  const runtime = runtimeOptions()
  const withOptionsMethod = `${method}WithOptions`
  if (typeof client[withOptionsMethod] !== 'function') {
    const err = new Error(`OCR 方法不存在: ${withOptionsMethod}`)
    err.code = 'OCR_METHOD_MISSING'
    throw err
  }

  const attempts = []
  if (imagePath) {
    attempts.push('body')
  }

  if (ocrApiUnreachable) {
    const err = new Error('ocr-api skipped after ENOTFOUND')
    err.code = 'ENOTFOUND'
    throw err
  }

  let lastError = null
  for (const mode of attempts) {
    try {
      let request
      if (mode === 'body') {
        request = new RequestClass()
        request.body = openImageReadable(imagePath)
      } else {
        const err = new Error('ocr-api url mode disabled')
        err.code = 'OCR_URL_DISABLED'
        throw err
      }

      const resp = await client[withOptionsMethod](request, runtime)
      const rawBody = resp?.body
      if (rawBody?.code && String(rawBody.code) !== '200') {
        const err = new Error(rawBody.message || `OCR ${method} 失败`)
        err.code = rawBody.code
        throw err
      }
      console.info('[desensitize-engine] ocr ok via body', method)
      return rawBody?.data || ''
    } catch (err) {
      lastError = err
      if (isAuthError(err)) throw err
      if (isNetworkError(err)) {
        ocrApiUnreachable = true
        throw err
      }
      if (isBenignDetectError(err)) continue
      console.warn(
        `[desensitize-engine] ocr ${method} ${mode} failed:`,
        err.code || '',
        String(err.message || '').slice(0, 100)
      )
    }
  }

  if (lastError) throw lastError
  return ''
}

function isNetworkError(err) {
  const code = String(err?.code || '').toUpperCase()
  const msg = String(err?.message || '').toLowerCase()
  return (
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'EAI_AGAIN' ||
    msg.includes('enotfound') ||
    msg.includes('getaddrinfo')
  )
}

function plateResultFromViapi(viapi, imageWidth, imageHeight, extras = {}) {
  const boxes = (viapi && viapi.boxes) || []
  const plateTextFound = Boolean(viapi && viapi.plateTextFound)
  return {
    boxes,
    authFailed: false,
    error: '',
    plateMaskMiss: plateTextFound && !boxes.length,
    orgWidth: (viapi && viapi.orgWidth) || imageWidth || 0,
    orgHeight: (viapi && viapi.orgHeight) || imageHeight || 0,
    ocrNetworkFailed: false,
    ...extras,
  }
}

async function detectPlateRegion(imagePath, detectOptions = {}) {
  const { imageWidth = 0, imageHeight = 0 } = detectOptions
  const useViapiFirst = config.desensitize.plateProvider === 'viapi'

  if (useViapiFirst) {
    try {
      const viapi = await detectPlateViaViapi(imagePath, imageWidth, imageHeight)
      return plateResultFromViapi(viapi, imageWidth, imageHeight)
    } catch (viapiErr) {
      if (isAuthError(viapiErr)) {
        return {
          boxes: [],
          authFailed: true,
          error: `plate-viapi:${viapiErr.message || 'auth'}`,
          plateMaskMiss: true,
          orgWidth: 0,
          orgHeight: 0,
          ocrNetworkFailed: false,
        }
      }
      if (isBenignDetectError(viapiErr)) {
        return {
          boxes: [],
          authFailed: false,
          error: '',
          plateMaskMiss: false,
          orgWidth: imageWidth,
          orgHeight: imageHeight,
          ocrNetworkFailed: false,
        }
      }
      console.warn(
        '[desensitize-engine] viapi plate failed, try ocr-api:',
        viapiErr.code || '',
        String(viapiErr.message || '').slice(0, 120)
      )
    }
  }

  let ocrApiError = ''
  try {
    const data = await ocrRecognize(
      RecognizeCarNumberRequest,
      'recognizeCarNumber',
      imagePath,
    )
    const plate = parsePlateResult(data)
    if (plate.boxes.length) {
      return {
        boxes: plate.boxes,
        authFailed: false,
        error: '',
        plateMaskMiss: false,
        orgWidth: plate.orgWidth,
        orgHeight: plate.orgHeight,
        ocrNetworkFailed: false,
      }
    }
    const summary = summarizeOcrPayload(data)
    if (summary.kv || summary.plateValue) {
      console.warn('[desensitize-engine] plate ocr-api parsed empty boxes', summary)
    }
  } catch (err) {
    ocrApiError = String(err.message || err.code || 'ocr-api failed')
    if (isAuthError(err)) {
      return {
        boxes: [],
        authFailed: true,
        error: `plate:${err.message || 'auth'}`,
        plateMaskMiss: true,
        orgWidth: 0,
        orgHeight: 0,
        ocrNetworkFailed: false,
      }
    }
    if (isNetworkError(err)) {
      /* 预发 ECS 常解析不了 ocr-api；后续 vin/text 会跳过 */
    } else if (!isBenignDetectError(err)) {
      console.warn('[desensitize-engine] plate ocr-api:', err.code || '', ocrApiError.slice(0, 120))
    }
  }

  try {
    const viapi = await detectPlateViaViapi(imagePath, imageWidth, imageHeight)
    return plateResultFromViapi(viapi, imageWidth, imageHeight, {
      ocrNetworkFailed: Boolean(ocrApiError && isNetworkError({ message: ocrApiError })),
    })
  } catch (viapiErr) {
    if (isAuthError(viapiErr)) {
      return {
        boxes: [],
        authFailed: true,
        error: `plate-viapi:${viapiErr.message || 'auth'}`,
        plateMaskMiss: true,
        orgWidth: 0,
        orgHeight: 0,
        ocrNetworkFailed: false,
      }
    }
    if (isBenignDetectError(viapiErr)) {
      return {
        boxes: [],
        authFailed: false,
        error: '',
        plateMaskMiss: false,
        orgWidth: imageWidth,
        orgHeight: imageHeight,
        ocrNetworkFailed: false,
      }
    }
    console.warn(
      '[desensitize-engine] viapi plate failed:',
      viapiErr.code || '',
      String(viapiErr.message || '').slice(0, 120)
    )
    return {
      boxes: [],
      authFailed: false,
      error: `plate-viapi:${viapiErr.message || 'failed'}`,
      plateMaskMiss: false,
      orgWidth: 0,
      orgHeight: 0,
      ocrNetworkFailed: isNetworkError(viapiErr) || isNetworkError({ message: ocrApiError }),
    }
  }
}

async function detectVin(imagePath) {
  if (ocrApiUnreachable) return []
  const data = await ocrRecognize(
      RecognizeCarVinCodeRequest,
      'recognizeCarVinCode',
      imagePath,
    )
  return parseVinBoxes(data)
}

async function detectGeneralText(imagePath) {
  if (ocrApiUnreachable) return []
  const data = await ocrRecognize(
      RecognizeGeneralRequest,
      'recognizeGeneral',
      imagePath,
    )
  return parseGeneralSensitiveBoxes(data)
}

/**
 * 阿里云只看缩小 JPEG；框再映回原图。禁止把杭州桶地址交给识别。
 */
async function detectSensitiveRegions(imagePath, options = {}) {
  const jpeg = await writePrivacyDetectJpeg(imagePath)
  const imageWidth = jpeg.width || 0
  const imageHeight = jpeg.height || 0
  console.info('[desensitize-engine] privacy jpeg', { width: imageWidth, height: imageHeight })

  let faceResult
  let plateResult
  let vinResult
  let textResult
  try {
    plateResult = await detectPlateRegion(jpeg.path, { imageWidth, imageHeight })
    faceResult = config.desensitize.detectFace
      ? await runDetector('face', () => detectFaces(jpeg.path))
      : { boxes: [], authFailed: false, error: '' }
    vinResult = await runDetector('vin', () => detectVin(jpeg.path))
    textResult = await runDetector('text', () => detectGeneralText(jpeg.path))
  } finally {
    jpeg.cleanup()
  }

  const results = [
    { name: 'face', ...faceResult },
    { name: 'plate', ...plateResult },
    { name: 'vin', ...vinResult },
    { name: 'text', ...textResult },
  ]

  const boxes = []
  const riskTags = new Set()
  const errors = []
  let ocrAuthFailed = false
  let plateMaskMiss = Boolean(plateResult.plateMaskMiss)
  const ocrNetworkFailed = Boolean(plateResult.ocrNetworkFailed)
  const ocrWidth = imageWidth
  const ocrHeight = imageHeight

  results.forEach((result) => {
    const name = result.name
    if (result.authFailed) {
      ocrAuthFailed = true
      if (result.error) errors.push(result.error)
      if (name === 'plate') plateMaskMiss = true
      return
    }
    if (result.error) errors.push(result.error)
    const found = result.boxes || []
    if (!found.length) return
    if (name === 'face') riskTags.add('face')
    if (name === 'plate') riskTags.add('plate')
    if (name === 'vin') riskTags.add('vin')
    if (name === 'text') {
      found.forEach((b) => {
        if (b.type === 'phone') riskTags.add('phone')
        else if (b.type === 'vin') riskTags.add('vin')
        else if (b.type === 'document') riskTags.add('document')
        else if (b.type === 'plate') riskTags.add('plate')
      })
    }
    boxes.push(...found)
  })

  if (ocrAuthFailed) {
    console.error('[desensitize-engine] ocr permission error', {
      errors,
      hint: '请为 ECS RAM 角色添加 ocr:RecognizeCarNumber / RecognizeCarVinCode / RecognizeGeneral',
    })
  }

  if (boxes.length) {
    console.info('[desensitize-engine] detections', {
      count: boxes.length,
      types: [...riskTags],
      plateMaskMiss,
      ocrAuthFailed,
    })
  } else if (errors.length) {
    console.warn('[desensitize-engine] no detections', { errors: errors.slice(0, 4), ocrAuthFailed })
  }

  return {
    boxes,
    riskTags: [...riskTags],
    errors,
    ocrAuthFailed,
    ocrNetworkFailed,
    plateMaskMiss,
    ocrWidth,
    ocrHeight,
  }
}

module.exports = {
  detectSensitiveRegions,
  resolvePublicImageUrl,
  plateResultFromViapi,
}
