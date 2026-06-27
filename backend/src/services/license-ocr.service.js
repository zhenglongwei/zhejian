const fs = require('fs')
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
  rewriteMediaUrlForCurrentBase,
  assertPersistentImageUrl,
  resolveMediaFilePathFromPublicUrl,
} = require('../lib/media-storage')
const { safeParseData } = require('./desensitize-engine/parse-ocr')

const { RecognizeBusinessLicenseRequest } = Ocr

function runtimeOptions() {
  return new RuntimeOptions({
    connectTimeout: config.desensitize.apiTimeoutMs,
    readTimeout: config.desensitize.apiTimeoutMs,
  })
}

/**
 * 营业执照 OCR 只走 ECS 本地文件流，不用公网 URL（自定义域名 Aliyun 不支持）。
 */
function resolveLicenseImagePath(licensePhotoUrl) {
  const persistent = assertPersistentImageUrl(licensePhotoUrl)
  const candidates = [
    resolveMediaFilePathFromPublicUrl(persistent),
    resolveMediaFilePathFromPublicUrl(rewriteMediaUrlForCurrentBase(persistent)),
  ].filter(Boolean)

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return filePath
    }
  }
  return ''
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

function assertMappedLicense(mapped, provider) {
  if (!mapped.legalName && !mapped.creditCode) {
    const err = new Error('未识别到营业执照关键信息，请手动填写')
    err.status = 422
    throw err
  }
  return { ...mapped, provider }
}

async function recognizeWithOcrApiBody(imagePath) {
  const client = getOcrClient()
  const runtime = runtimeOptions()
  const request = new RecognizeBusinessLicenseRequest()
  request.body = openImageReadable(imagePath)
  const resp = await client.recognizeBusinessLicenseWithOptions(request, runtime)
  const body = resp?.body || {}
  const code = body.code ?? body.Code
  if (code != null && String(code) !== '200') {
    const err = new Error(body.message || body.Message || '营业执照识别失败')
    err.code = code
    throw err
  }
  const rawData = body.data ?? body.Data
  return assertMappedLicense(mapLicenseOcrResult(rawData), 'ocr-api-body')
}

async function recognizeWithViapiBody(imagePath) {
  const client = getViapiOcrClient()
  const runtime = runtimeOptions()
  const AdvanceRequest = ViapiOcr.RecognizeBusinessLicenseAdvanceRequest
  if (!AdvanceRequest || typeof client.recognizeBusinessLicenseAdvance !== 'function') {
    const err = new Error('VIAPI 营业执照识别不可用')
    err.status = 503
    throw err
  }
  const request = new AdvanceRequest()
  request.imageURLObject = openImageReadable(imagePath)
  const resp = await client.recognizeBusinessLicenseAdvance(request, runtime)
  const body = resp?.body || {}
  const rawData = body.data ?? body.Data
  return assertMappedLicense(mapLicenseOcrResult(rawData), 'viapi-body')
}

async function recognizeBusinessLicense(licensePhotoUrl) {
  const url = String(licensePhotoUrl || '').trim()
  if (!url) {
    const err = new Error('请先上传营业执照照片')
    err.status = 400
    throw err
  }

  const imagePath = resolveLicenseImagePath(url)
  if (!imagePath) {
    const err = new Error('服务器未找到已上传的营业执照，请重新上传后再识别')
    err.status = 400
    throw err
  }

  console.info('[license-ocr] recognize via local file', {
    imagePath,
    sourceUrl: rewriteMediaUrlForCurrentBase(assertPersistentImageUrl(url)),
  })

  try {
    return await recognizeWithOcrApiBody(imagePath)
  } catch (ocrApiError) {
    console.warn('[license-ocr] ocr-api body failed', ocrApiError && ocrApiError.message)
    try {
      return await recognizeWithViapiBody(imagePath)
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
  resolveLicenseImagePath,
}
