const { RuntimeOptions } = require('@darabonba/typescript')
const Ocr = require('@alicloud/ocr-api20210707')
const Facebody = require('@alicloud/facebody20191230')
const { config } = require('../../../config')
const { buildPublicMediaUrl } = require('../../../lib/media-storage')
const { getOcrClient, getFaceClient, openImageReadable } = require('../../../lib/aliyun-clients')
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

function isAuthError(err) {
  const code = String(err?.code || err?.data?.Code || '').toLowerCase()
  const msg = String(err?.message || '').toLowerCase()
  return (
    code.includes('nopermission') ||
    code.includes('invalidaccesskey') ||
    code.includes('invalidcredentials') ||
    code.includes('signature') ||
    code.includes('unauthorized') ||
    msg.includes('accesskey') ||
    msg.includes('credential') ||
    msg.includes('forbidden') ||
    msg.includes('denied') ||
    msg.includes('not authorized') ||
    msg.includes('权限') ||
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
    if (isBenignDetectError(err)) {
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

async function ocrRecognize(RequestClass, method, imagePath, publicUrl) {
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
  const imageUrl = resolvePublicImageUrl(imagePath, publicUrl)
  if (imageUrl) {
    attempts.push('url')
  }

  let lastError = null
  for (const mode of attempts) {
    try {
      let request
      if (mode === 'body') {
        request = new RequestClass()
        request.body = openImageReadable(imagePath)
      } else {
        request = new RequestClass({ url: imageUrl })
      }

      const resp = await client[withOptionsMethod](request, runtime)
      const rawBody = resp?.body
      if (rawBody?.code && String(rawBody.code) !== '200') {
        const err = new Error(rawBody.message || `OCR ${method} 失败`)
        err.code = rawBody.code
        throw err
      }
      if (mode === 'url') {
        console.info('[desensitize-engine] ocr ok via url', method, imageUrl)
      } else {
        console.info('[desensitize-engine] ocr ok via body', method)
      }
      return rawBody?.data || ''
    } catch (err) {
      lastError = err
      if (isAuthError(err)) throw err
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

async function detectPlateRegion(imagePath, publicUrl) {
  try {
    const data = await ocrRecognize(
      RecognizeCarNumberRequest,
      'recognizeCarNumber',
      imagePath,
      publicUrl
    )
    const plate = parsePlateResult(data)
    if (!plate.boxes.length) {
      const summary = summarizeOcrPayload(data)
      if (summary.kv || summary.plateValue) {
        console.warn('[desensitize-engine] plate ocr parsed empty boxes', summary)
      } else if (data) {
        console.warn('[desensitize-engine] plate ocr empty result', {
          sample: String(data).slice(0, 120),
        })
      }
    }
    return {
      boxes: plate.boxes,
      authFailed: false,
      error: '',
      plateMaskMiss: plate.plateTextFound && !plate.boxes.length,
      orgWidth: plate.orgWidth,
      orgHeight: plate.orgHeight,
    }
  } catch (err) {
    if (isAuthError(err)) {
      return {
        boxes: [],
        authFailed: true,
        error: `plate:${err.message || 'auth'}`,
        plateMaskMiss: true,
        orgWidth: 0,
        orgHeight: 0,
      }
    }
    if (isBenignDetectError(err)) {
      return {
        boxes: [],
        authFailed: false,
        error: '',
        plateMaskMiss: false,
        orgWidth: 0,
        orgHeight: 0,
      }
    }
    console.warn('[desensitize-engine] plate:', err.code || '', String(err.message || '').slice(0, 120))
    return {
      boxes: [],
      authFailed: false,
      error: `plate:${err.message || 'failed'}`,
      plateMaskMiss: false,
      orgWidth: 0,
      orgHeight: 0,
    }
  }
}

async function detectVin(imagePath, publicUrl) {
  const data = await ocrRecognize(
    RecognizeCarVinCodeRequest,
    'recognizeCarVinCode',
    imagePath,
    publicUrl
  )
  return parseVinBoxes(data)
}

async function detectGeneralText(imagePath, publicUrl) {
  const data = await ocrRecognize(
    RecognizeGeneralRequest,
    'recognizeGeneral',
    imagePath,
    publicUrl
  )
  return parseGeneralSensitiveBoxes(data)
}

/**
 * @param {string} imagePath
 * @param {{ publicUrl?: string }} [options]
 */
async function detectSensitiveRegions(imagePath, options = {}) {
  const publicUrl = options.publicUrl || ''

  const [faceResult, plateResult, vinResult, textResult] = await Promise.all([
    runDetector('face', () => detectFaces(imagePath)),
    detectPlateRegion(imagePath, publicUrl),
    runDetector('vin', () => detectVin(imagePath, publicUrl)),
    runDetector('text', () => detectGeneralText(imagePath, publicUrl)),
  ])

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
  let ocrWidth = plateResult.orgWidth || 0
  let ocrHeight = plateResult.orgHeight || 0

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
    plateMaskMiss,
    ocrWidth,
    ocrHeight,
  }
}

module.exports = {
  detectSensitiveRegions,
  resolvePublicImageUrl,
}
