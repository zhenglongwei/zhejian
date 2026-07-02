const { RuntimeOptions } = require('@darabonba/typescript')
const Ocr = require('@alicloud/ocr-api20210707')
const { config } = require('../config')
const { getOcrClient, openImageReadable } = require('../lib/aliyun-clients')
const { resolvePlanQuoteImageSources } = require('../lib/plan-quote-image-source')
const { safeParseData, unwrapOcrRoot } = require('./desensitize-engine/parse-ocr')

const { RecognizeGeneralRequest } = Ocr

function runtimeOptions() {
  return new RuntimeOptions({
    connectTimeout: config.desensitize.apiTimeoutMs,
    readTimeout: config.desensitize.apiTimeoutMs,
  })
}

function resolveImageSources(imageUrl) {
  const { publicUrl, imagePath } = resolvePlanQuoteImageSources(imageUrl)
  return { publicUrl, imagePath: imagePath || null }
}

function collectOcrTexts(data) {
  const root = unwrapOcrRoot(safeParseData(data))
  const texts = []
  const push = (value) => {
    const text = String(value || '').trim()
    if (text) texts.push(text)
  }
  if (!root) return texts
  if (typeof root === 'string') {
    push(root)
    return texts
  }
  if (root.content) push(root.content)
  if (Array.isArray(root.prism_wordsInfo)) {
    root.prism_wordsInfo.forEach((item) => push(item.word))
  }
  if (Array.isArray(root.lines)) {
    root.lines.forEach((line) => push(line.text || line.content))
  }
  return texts
}

async function recognizeGeneralText(imageUrl) {
  const { publicUrl, imagePath } = resolveImageSources(imageUrl)
  const client = getOcrClient()
  const runtime = runtimeOptions()
  const attempts = []
  if (imagePath) attempts.push('body')
  if (publicUrl) attempts.push('url')

  let lastError = null
  for (const mode of attempts) {
    try {
      let request
      if (mode === 'body') {
        request = new RecognizeGeneralRequest()
        request.body = openImageReadable(imagePath)
      } else {
        request = new RecognizeGeneralRequest({ url: publicUrl })
      }
      const resp = await client.recognizeGeneralWithOptions(request, runtime)
      const rawBody = resp?.body
      if (rawBody?.code && String(rawBody.code) !== '200') {
        const err = new Error(rawBody.message || 'OCR 识别失败')
        err.code = rawBody.code
        throw err
      }
      return collectOcrTexts(rawBody?.data).join('\n')
    } catch (err) {
      lastError = err
    }
  }
  if (lastError) throw lastError
  return ''
}

function mockPlanQuoteRows() {
  return {
    provider: 'mock',
    textPreview: '左前大灯总成 品牌件 ×1 1680元',
    planPartsDraft: [
      {
        planPartId: 'plan_headlight',
        name: '左前大灯总成',
        partType: '品牌件',
        partBrand: '海拉',
        partCode: '',
        qty: 1,
        unitPrice: 1680,
        lineTotal: 1680,
        status: 'draft',
      },
    ],
  }
}

module.exports = {
  mockPlanQuoteRows,
  recognizeGeneralText,
}
