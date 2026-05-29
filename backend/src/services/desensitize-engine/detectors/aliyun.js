const { RuntimeOptions } = require('@darabonba/typescript')
const Ocr = require('@alicloud/ocr-api20210707')
const Facebody = require('@alicloud/facebody20191230')
const { config } = require('../../../config')
const { getOcrClient, getFaceClient, readImageBody, openImageStream } = require('../../../lib/aliyun-clients')
const { boxesFromFaceRectangles } = require('../bbox')
const { parsePlateBoxes, parseVinBoxes, parseGeneralSensitiveBoxes } = require('../parse-ocr')

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
    msg.includes('forbidden')
  )
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
  const body = readImageBody(imagePath)
  const request = new RequestClass({ body })
  const resp = await client[method](request)
  const rawBody = resp?.body
  if (rawBody?.code && String(rawBody.code) !== '200') {
    const err = new Error(rawBody.message || `OCR ${method} 失败`)
    err.code = rawBody.code
    throw err
  }
  return rawBody?.data || ''
}

async function detectPlates(imagePath) {
  const data = await ocrWithBody(RecognizeCarNumberRequest, 'recognizeCarNumber', imagePath)
  return parsePlateBoxes(data)
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
 * 并行调用阿里云检测，单路「未检出」不算失败
 * @returns {{ boxes: import('./bbox').BBox[], riskTags: string[], errors: string[], authFailed: boolean }}
 */
async function detectSensitiveRegions(imagePath) {
  const tasks = [
    { name: 'face', fn: () => detectFaces(imagePath) },
    { name: 'plate', fn: () => detectPlates(imagePath) },
    { name: 'vin', fn: () => detectVin(imagePath) },
    { name: 'text', fn: () => detectGeneralText(imagePath) },
  ]

  const results = await Promise.allSettled(tasks.map((t) => t.fn()))
  const boxes = []
  const riskTags = new Set()
  const errors = []
  let authFailed = false

  results.forEach((result, idx) => {
    const name = tasks[idx].name
    if (result.status === 'fulfilled') {
      const found = result.value || []
      if (found.length) {
        if (name === 'face') riskTags.add('face')
        if (name === 'plate') riskTags.add('plate')
        if (name === 'vin') riskTags.add('vin')
        if (name === 'text') {
          found.forEach((b) => {
            if (b.type === 'phone') riskTags.add('phone')
            else if (b.type === 'vin') riskTags.add('vin')
            else if (b.type === 'document') riskTags.add('document')
          })
        }
        boxes.push(...found)
      }
      return
    }
    const err = result.reason
    if (isAuthError(err)) authFailed = true
    errors.push(`${name}:${err?.message || 'failed'}`)
  })

  const allRejected = results.every((r) => r.status === 'rejected')
  if (allRejected) {
    const err = new Error(
      authFailed ? '阿里云凭证无效或权限不足' : '脱敏检测服务不可用，请稍后重试'
    )
    err.code = authFailed ? 'ALIYUN_AUTH_FAILED' : 'DETECT_ALL_FAILED'
    throw err
  }

  return { boxes, riskTags: [...riskTags], errors, authFailed }
}

module.exports = {
  detectSensitiveRegions,
}
