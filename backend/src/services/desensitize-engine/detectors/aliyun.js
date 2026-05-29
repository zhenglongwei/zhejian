const { RuntimeOptions } = require('@darabonba/typescript')
const Ocr = require('@alicloud/ocr-api20210707')
const Facebody = require('@alicloud/facebody20191230')
const { config } = require('../../../config')
const { getOcrClient, getFaceClient, openImageStream } = require('../../../lib/aliyun-clients')
const { boxesFromFaceRectangles } = require('../bbox')
const {
  parsePlateResult,
  parseVinBoxes,
  parseGeneralSensitiveBoxes,
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
    msg.includes('accesskey') ||
    msg.includes('credential') ||
    msg.includes('forbidden') ||
    msg.includes('denied') ||
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
    msg.includes('未识别') ||
    msg.includes('无识别') ||
    msg.includes('没找到') ||
    msg.includes('notfoundface')
  )
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

function runtimeOptions() {
  return new RuntimeOptions({
    connectTimeout: config.desensitize.apiTimeoutMs,
    readTimeout: config.desensitize.apiTimeoutMs,
  })
}

async function detectFaces(imagePath) {
  const client = getFaceClient()
  const runtime = runtimeOptions()
  const request = new DetectFaceAdvanceRequest({
    imageURLObject: openImageStream(imagePath),
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

async function ocrWithBody(RequestClass, method, imagePath) {
  const client = getOcrClient()
  const request = new RequestClass({ body: openImageStream(imagePath) })
  const resp = await client[method](request)
  const rawBody = resp?.body
  if (rawBody?.code && String(rawBody.code) !== '200') {
    const err = new Error(rawBody.message || `OCR ${method} 失败`)
    err.code = rawBody.code
    throw err
  }
  return rawBody?.data || ''
}

async function detectPlateRegion(imagePath) {
  try {
    const data = await ocrWithBody(RecognizeCarNumberRequest, 'recognizeCarNumber', imagePath)
    const plate = parsePlateResult(data)
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
        plateMaskMiss: false,
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

async function detectVin(imagePath) {
  const data = await ocrWithBody(RecognizeCarVinCodeRequest, 'recognizeCarVinCode', imagePath)
  return parseVinBoxes(data)
}

async function detectGeneralText(imagePath) {
  const data = await ocrWithBody(RecognizeGeneralRequest, 'recognizeGeneral', imagePath)
  return parseGeneralSensitiveBoxes(data)
}

/**
 * @returns {{ boxes: import('../bbox').BBox[], riskTags: string[], errors: string[], authFailed: boolean, plateMaskMiss: boolean, ocrWidth: number, ocrHeight: number }}
 */
async function detectSensitiveRegions(imagePath) {
  const [faceResult, plateResult, vinResult, textResult] = await Promise.all([
    runDetector('face', () => detectFaces(imagePath)),
    detectPlateRegion(imagePath),
    runDetector('vin', () => detectVin(imagePath)),
    runDetector('text', () => detectGeneralText(imagePath)),
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
  let authFailed = false
  let plateMaskMiss = Boolean(plateResult.plateMaskMiss)
  const ocrWidth = plateResult.orgWidth || 0
  const ocrHeight = plateResult.orgHeight || 0

  results.forEach((result) => {
    const name = result.name
    if (result.authFailed) {
      authFailed = true
      if (result.error) errors.push(result.error)
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

  if (authFailed) {
    const err = new Error('阿里云凭证无效或权限不足')
    err.code = 'ALIYUN_AUTH_FAILED'
    throw err
  }

  if (boxes.length) {
    console.info('[desensitize-engine] detections', {
      count: boxes.length,
      types: [...riskTags],
      plateMaskMiss,
    })
  }

  return {
    boxes,
    riskTags: [...riskTags],
    errors,
    authFailed: false,
    plateMaskMiss,
    ocrWidth,
    ocrHeight,
  }
}

module.exports = {
  detectSensitiveRegions,
}
