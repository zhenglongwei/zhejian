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
  parseObjectKeyFromPublicUrl,
  parseDesensitizedObjectKeyFromPublicUrl,
} = require('../lib/media-storage')
const { materializeMediaFile, objectKeyFromPublicUrl } = require('../lib/media-blob')
const { safeParseData } = require('./desensitize-engine/parse-ocr')
const { normalizeLicenseEstablishedOn } = require('../utils/license-established')

const { RecognizeBusinessLicenseRequest, RecognizeIdcardRequest } = Ocr

function runtimeOptions() {
  return new RuntimeOptions({
    connectTimeout: config.desensitize.apiTimeoutMs,
    readTimeout: config.desensitize.apiTimeoutMs,
  })
}

/**
 * 营业执照 OCR：优先 OSS/本地物化文件流，不用公网 URL（自定义域名 Aliyun 不支持）。
 * @returns {Promise<{ filePath: string, cleanup: function }|null>}
 */
async function resolveLicenseImageMaterialized(licensePhotoUrl) {
  const persistent = assertPersistentImageUrl(licensePhotoUrl)
  const key =
    objectKeyFromPublicUrl(persistent) ||
    parseObjectKeyFromPublicUrl(persistent) ||
    parseDesensitizedObjectKeyFromPublicUrl(persistent) ||
    objectKeyFromPublicUrl(rewriteMediaUrlForCurrentBase(persistent)) ||
    parseObjectKeyFromPublicUrl(rewriteMediaUrlForCurrentBase(persistent))
  if (!key) return null
  try {
    return await materializeMediaFile(key)
  } catch (e) {
    return null
  }
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

function toPlainOcr(value) {
  if (value == null) return value
  if (typeof value === 'string') return safeParseData(value) || value
  if (typeof value !== 'object') return value
  if (typeof value.toMap === 'function') {
    try {
      const mapped = value.toMap()
      if (mapped && typeof mapped === 'object') return mapped
    } catch (e) {
      /* keep original */
    }
  }
  return value
}

function unwrapLicensePayload(raw) {
  let node = toPlainOcr(safeParseData(raw) || (raw && typeof raw === 'object' ? raw : null))
  if (!node) return null

  for (let i = 0; i < 4; i += 1) {
    node = toPlainOcr(node)
    const inner = node && typeof node === 'object' ? node.data ?? node.Data : null
    if (inner == null) break
    if (typeof inner === 'string') {
      const parsed = safeParseData(inner)
      if (!parsed) break
      node = parsed
      continue
    }
    if (typeof inner === 'object' && !Array.isArray(inner)) {
      node = inner
      continue
    }
    break
  }
  return toPlainOcr(node)
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
    licenseEstablishedOn: normalizeLicenseEstablishedOn(
      pickField(data, [
        // 阿里云 ocr-api：注册日期（可能为「2017年01月04日」或 20170104）
        'RegistrationDate',
        'registrationDate',
        // 阿里云 VIAPI：EstablishDate 常为 20150504
        'EstablishDate',
        'establishDate',
        // 营业期限起始（格式化，常为 20170104 数字）
        'validFromDate',
        'ValidFromDate',
        'issueDate',
        'IssueDate',
        'foundingDate',
        'FoundingDate',
        // 营业期限文案：「2017年01月04日至长期」——仅作兜底
        'validPeriod',
        'ValidPeriod',
        'validDate',
        'ValidDate',
      ])
    ),
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function ocrErrorText(err) {
  return `${err && err.code ? err.code : ''} ${err && err.message ? err.message : ''}`
}

function isOcrApiUnreachableError(err) {
  const text = ocrErrorText(err).toLowerCase()
  return (
    String(err && err.code || '').toUpperCase() === 'ENOTFOUND' ||
    text.includes('enotfound') ||
    text.includes('getaddrinfo')
  )
}

function isRetryableOcrError(err) {
  const text = ocrErrorText(err)
  return /ServiceUnavailable|Throttling|503|ECONNRESET|ETIMEDOUT|timeout|限流/i.test(text)
}

function toUserOcrError(err, fallback) {
  const text = ocrErrorText(err)
  if (/未识别到营业执照关键信息/.test(String(err && err.message || ''))) {
    return err
  }
  if (/InvalidImage|NoOcrResult|未识别|无识别/i.test(text)) {
    const mapped = new Error('未识别到营业执照关键信息，请手动填写')
    mapped.status = 422
    return mapped
  }
  const mapped = new Error(fallback)
  mapped.status = 502
  return mapped
}

let ocrApiUnreachable = false

async function withOcrRetries(fn, times = 3) {
  let lastError
  for (let attempt = 0; attempt < times; attempt += 1) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (!isRetryableOcrError(err) || attempt === times - 1) throw err
      console.warn('[license-ocr] retry', {
        attempt: attempt + 1,
        message: String(err && err.message || '').slice(0, 120),
      })
      await sleep(400 * (attempt + 1))
    }
  }
  throw lastError
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

  const materialized = await resolveLicenseImageMaterialized(url)
  if (!materialized || !materialized.filePath) {
    const err = new Error('服务器未找到已上传的营业执照，请重新上传后再识别')
    err.status = 400
    throw err
  }

  const imagePath = materialized.filePath
  console.info('[license-ocr] recognize via local file', {
    imagePath,
    sourceUrl: rewriteMediaUrlForCurrentBase(assertPersistentImageUrl(url)),
  })

  try {
    try {
      const mapped = await withOcrRetries(() => recognizeWithViapiBody(imagePath))
      console.info('[license-ocr] viapi ok')
      return mapped
    } catch (viapiError) {
      console.warn('[license-ocr] viapi failed', String(viapiError && viapiError.message || '').slice(0, 160))
      if (!ocrApiUnreachable) {
        try {
          const mapped = await recognizeWithOcrApiBody(imagePath)
          console.info('[license-ocr] ocr-api ok')
          return mapped
        } catch (ocrApiError) {
          if (isOcrApiUnreachableError(ocrApiError)) ocrApiUnreachable = true
          console.warn(
            '[license-ocr] ocr-api body failed',
            String(ocrApiError && ocrApiError.message || '').slice(0, 160)
          )
        }
      }
      throw toUserOcrError(
        viapiError,
        '执照识别暂时不可用，请稍后重试，或先手填主体名称和信用代码'
      )
    }
  } finally {
    if (materialized.cleanup) await materialized.cleanup()
  }
}

function pickIdField(node, keys) {
  if (!node || typeof node !== 'object') return ''
  const data = node.data && typeof node.data === 'object' && !Array.isArray(node.data) ? node.data : node
  return pickField(data, keys)
}

function idCardNode(data, keys) {
  if (!data || typeof data !== 'object') return null
  for (const key of keys) {
    if (data[key] && typeof data[key] === 'object') return data[key]
  }
  return null
}

function ocrShapeKeys(raw) {
  const node = toPlainOcr(raw)
  if (!node || typeof node !== 'object') return { type: typeof raw }
  const keys = Object.keys(node)
  const nested = {}
  keys.forEach((key) => {
    const value = node[key]
    nested[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.keys(toPlainOcr(value))
        : typeof value
  })
  return nested
}

function mapIdCardOcrResult(raw) {
  const data = unwrapLicensePayload(raw) || {}
  const faceNode = toPlainOcr(
    idCardNode(data, ['frontResult', 'FrontResult', 'face', 'Face']) || data
  )
  const backNode = toPlainOcr(
    idCardNode(data, ['backResult', 'BackResult', 'back', 'Back']) || data
  )
  const name = pickIdField(faceNode, ['name', 'Name', '姓名'])
  const startDate = pickIdField(backNode, ['startDate', 'StartDate'])
  const endDate = pickIdField(backNode, ['endDate', 'EndDate'])
  const validPeriod =
    pickIdField(backNode, ['validPeriod', 'ValidPeriod', 'validDate', 'ValidDate']) ||
    [startDate, endDate].filter(Boolean).join('-')
  const issueAuthority = pickIdField(backNode, [
    'issueAuthority',
    'IssueAuthority',
    'issue',
    'Issue',
    '签发机关',
  ])
  const hasBack = Boolean(validPeriod || issueAuthority)
  return {
    name,
    validPeriod,
    issueAuthority,
    side: name ? 'face' : hasBack ? 'back' : '',
  }
}

async function recognizeIdCardWithOcrApi(imagePath) {
  const client = getOcrClient()
  const runtime = runtimeOptions()
  const request = new RecognizeIdcardRequest()
  request.body = openImageReadable(imagePath)
  const resp = await client.recognizeIdcardWithOptions(request, runtime)
  const body = resp?.body || {}
  const code = body.code ?? body.Code
  if (code != null && String(code) !== '200') {
    const err = new Error(body.message || body.Message || '身份证识别失败')
    err.status = 502
    throw err
  }
  return mapIdCardOcrResult(body.data ?? body.Data)
}

async function recognizeIdCardWithViapi(imagePath, side = '') {
  const client = getViapiOcrClient()
  const runtime = runtimeOptions()
  const AdvanceRequest = ViapiOcr.RecognizeIdentityCardAdvanceRequest
  if (!AdvanceRequest || typeof client.recognizeIdentityCardAdvance !== 'function') {
    const err = new Error('VIAPI 身份证识别不可用')
    err.status = 503
    throw err
  }
  const request = new AdvanceRequest()
  request.imageURLObject = openImageReadable(imagePath)
  if (side) request.side = side
  const resp = await client.recognizeIdentityCardAdvance(request, runtime)
  const body = resp?.body || {}
  const rawData = body.data ?? body.Data
  const mapped = mapIdCardOcrResult(rawData)
  if (!mapped.name && !mapped.issueAuthority && !mapped.validPeriod) {
    console.warn('[license-ocr] idcard viapi empty map', {
      requestedSide: side,
      shape: ocrShapeKeys(rawData),
    })
  }
  return mapped
}

async function recognizeIdCard(photoUrl, options = {}) {
  const url = String(photoUrl || '').trim()
  if (!url) {
    const err = new Error('请上传法人身份证')
    err.status = 400
    throw err
  }
  const materialized = await resolveLicenseImageMaterialized(url)
  if (!materialized || !materialized.filePath) {
    const err = new Error('服务器未找到已上传的身份证，请重新上传后再识别')
    err.status = 400
    throw err
  }
  const side = String(options.side || '').trim()
  try {
    try {
      const mapped = await withOcrRetries(() =>
        recognizeIdCardWithViapi(materialized.filePath, side)
      )
      console.info('[license-ocr] idcard viapi ok', {
        requestedSide: side,
        mappedSide: mapped.side,
        hasName: Boolean(mapped.name),
        hasBack: Boolean(mapped.issueAuthority || mapped.validPeriod),
      })
      return mapped
    } catch (viapiError) {
      console.warn(
        '[license-ocr] idcard viapi failed',
        String(viapiError && viapiError.message || '').slice(0, 160)
      )
      if (!ocrApiUnreachable) {
        try {
          const mapped = await recognizeIdCardWithOcrApi(materialized.filePath)
          console.info('[license-ocr] idcard ocr-api ok')
          return mapped
        } catch (ocrApiError) {
          if (isOcrApiUnreachableError(ocrApiError)) ocrApiUnreachable = true
          console.warn(
            '[license-ocr] idcard ocr-api failed',
            String(ocrApiError && ocrApiError.message || '').slice(0, 160)
          )
        }
      }
      throw toUserOcrError(viapiError, '身份证识别暂时不可用，请稍后重试')
    }
  } finally {
    if (materialized.cleanup) await materialized.cleanup()
  }
}

module.exports = {
  recognizeBusinessLicense,
  recognizeIdCard,
  mapLicenseOcrResult,
  mapIdCardOcrResult,
  resolveLicenseImageMaterialized,
}
