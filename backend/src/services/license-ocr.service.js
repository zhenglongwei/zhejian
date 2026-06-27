const { RuntimeOptions } = require('@darabonba/typescript')
const Ocr = require('@alicloud/ocr-api20210707')
const ViapiOcr = require('@alicloud/ocr20191230')
const { config } = require('../config')
const {
  getOcrClient,
  getViapiOcrClient,
  openImageReadable,
} = require('../lib/aliyun-clients')
const {
  parseObjectKeyFromPublicUrl,
  resolveObjectKeyFilePath,
  rewriteMediaUrlForCurrentBase,
  assertPersistentImageUrl,
} = require('../lib/media-storage')
const { safeParseData } = require('./desensitize-engine/parse-ocr')

const { RecognizeBusinessLicenseRequest } = Ocr
const { RecognizeBusinessLicenseRequest: ViapiBizLicenseRequest } = ViapiOcr

function runtimeOptions() {
  return new RuntimeOptions({
    connectTimeout: config.desensitize.apiTimeoutMs,
    readTimeout: config.desensitize.apiTimeoutMs,
  })
}

function resolveImageSources(licensePhotoUrl) {
  const persistent = assertPersistentImageUrl(licensePhotoUrl)
  const publicUrl = rewriteMediaUrlForCurrentBase(persistent)
  const objectKey = parseObjectKeyFromPublicUrl(publicUrl)
  const imagePath = objectKey ? resolveObjectKeyFilePath(objectKey) : null
  return { publicUrl, imagePath }
}

function pickField(obj, keys) {
  if (!obj || typeof obj !== 'object') return ''
  for (const key of keys) {
    const value = obj[key]
    if (value != null && String(value).trim()) {
      return String(value).trim()
    }
  }
  return ''
}

function normalizeCreditCode(value) {
  const code = String(value || '').trim().toUpperCase()
  if (!code) return ''
  return code.replace(/\s+/g, '')
}

function unwrapLicensePayload(raw) {
  let node = safeParseData(raw)
  if (!node && raw && typeof raw === 'object') {
    node = raw
  }
  if (!node) return null

  for (let i = 0; i < 4; i += 1) {
    if (node.data == null) break
    if (typeof node.data === 'string') {
      const inner = safeParseData(node.data)
      if (!inner) break
      node = inner
      continue
    }
    if (typeof node.data === 'object' && !Array.isArray(node.data)) {
      node = node.data
      continue
    }
    break
  }
  return node
}

function mapLicenseOcrResult(raw) {
  const data = unwrapLicensePayload(raw) || {}
  return {
    legalName: pickField(data, [
      'companyName',
      'CompanyName',
      'name',
      'Name',
      'title',
      'Title',
      'enterpriseName',
      'EnterpriseName',
    ]),
    creditCode: normalizeCreditCode(
      pickField(data, [
        'creditCode',
        'CreditCode',
        'unifiedSocialCreditCode',
        'UnifiedSocialCreditCode',
        'registrationNumber',
        'RegistrationNumber',
        'registerNumber',
        'RegisterNumber',
        'regNum',
        'RegNum',
      ])
    ),
    legalPerson: pickField(data, [
      'legalPerson',
      'LegalPerson',
      'legalRepresentative',
      'LegalRepresentative',
      'person',
      'Person',
    ]),
    businessScope: pickField(data, ['businessScope', 'BusinessScope', 'scope', 'Scope']),
    companyType: pickField(data, ['companyType', 'CompanyType', 'type', 'Type']),
    businessAddress: pickField(data, [
      'businessAddress',
      'BusinessAddress',
      'address',
      'Address',
      'companyAddress',
      'CompanyAddress',
    ]),
  }
}

async function recognizeWithOcrApi(imagePath, publicUrl) {
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
        request = new RecognizeBusinessLicenseRequest()
        request.body = openImageReadable(imagePath)
      } else {
        request = new RecognizeBusinessLicenseRequest({ url: publicUrl })
      }
      const resp = await client.recognizeBusinessLicenseWithOptions(request, runtime)
      const body = resp?.body || {}
      const code = body.code ?? body.Code
      if (code != null && String(code) !== '200') {
        const err = new Error(body.message || body.Message || '营业执照识别失败')
        err.code = code
        throw err
      }
      const rawData = body.data ?? body.Data
      const mapped = mapLicenseOcrResult(rawData)
      if (!mapped.legalName && !mapped.creditCode) {
        const err = new Error('未识别到营业执照关键信息，请手动填写')
        err.status = 422
        throw err
      }
      return { ...mapped, provider: 'ocr-api' }
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('营业执照识别失败')
}

async function recognizeWithViapi(publicUrl) {
  if (!publicUrl) {
    const err = new Error('缺少可访问的营业执照图片地址')
    err.status = 400
    throw err
  }
  const client = getViapiOcrClient()
  const runtime = runtimeOptions()
  const request = new ViapiBizLicenseRequest({ imageURL: publicUrl })
  const resp = await client.recognizeBusinessLicenseWithOptions(request, runtime)
  const body = resp?.body || {}
  const rawData = body.data ?? body.Data
  const mapped = mapLicenseOcrResult(rawData)
  if (!mapped.legalName && !mapped.creditCode) {
    const err = new Error('未识别到营业执照关键信息，请手动填写')
    err.status = 422
    throw err
  }
  return { ...mapped, provider: 'viapi' }
}

async function recognizeBusinessLicense(licensePhotoUrl) {
  const url = String(licensePhotoUrl || '').trim()
  if (!url) {
    const err = new Error('请先上传营业执照照片')
    err.status = 400
    throw err
  }

  const { publicUrl, imagePath } = resolveImageSources(url)

  try {
    return await recognizeWithOcrApi(imagePath, publicUrl)
  } catch (ocrApiError) {
    try {
      return await recognizeWithViapi(publicUrl)
    } catch (viapiError) {
      const err = new Error(
        viapiError.message || ocrApiError.message || '营业执照识别失败，请手动填写'
      )
      err.status = viapiError.status || ocrApiError.status || 502
      throw err
    }
  }
}

module.exports = {
  recognizeBusinessLicense,
  mapLicenseOcrResult,
}
