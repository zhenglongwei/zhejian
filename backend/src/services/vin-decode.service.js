/**
 * ALB-UX-02 · 阿里云市场 VIN 解析（sxvin.market.alicloudapi.com）
 * @see https://market.aliyun.com/detail/cmapi00065243
 */
const { config } = require('../config')

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i

function httpError(message, status = 400, code = '') {
  const err = new Error(message)
  err.status = status
  if (code) err.code = code
  return err
}

function normalizeVin(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

function pickFirst(obj, keys) {
  for (const key of keys) {
    const val = obj && obj[key]
    if (val != null && String(val).trim() !== '') return String(val).trim()
  }
  return ''
}

/**
 * 将云市场常见字段映射为相册 vehicleJson 增量
 */
function mapAliyunVinResult(raw = {}) {
  const root = raw.result || raw.data || raw.Result || raw.Data || raw
  const brand = pickFirst(root, ['brand', 'Brand', '品牌', 'carBrand', 'manufacturer'])
  const series = pickFirst(root, [
    'series',
    'Series',
    '车系',
    'model',
    'Model',
    '车型',
    'carSeries',
    'vehicleName',
  ])
  const modelYear = pickFirst(root, [
    'modelYear',
    'year',
    'Year',
    '年份',
    'produceYear',
    '生产年份',
  ])
  const chassisCode = pickFirst(root, ['chassisCode', 'chassis', '底盘号', 'chassisNo'])
  const engineModel = pickFirst(root, ['engineModel', 'engine', '发动机型号', 'engineNo'])
  const displacement = pickFirst(root, ['displacement', '排量', 'cc'])
  const gearbox = pickFirst(root, ['gearbox', 'transmission', '变速箱', '变速器'])
  const vin = normalizeVin(pickFirst(root, ['vin', 'VIN', 'Vin']) || '')

  const vehicle = {}
  if (brand) vehicle.brand = brand
  if (series) vehicle.series = series
  if (modelYear) vehicle.modelYear = modelYear
  if (chassisCode) vehicle.chassisCode = chassisCode
  if (engineModel) vehicle.engineModel = engineModel
  if (displacement) vehicle.displacement = displacement
  if (gearbox) vehicle.gearbox = gearbox
  if (vin) vehicle.vin = vin
  vehicle.vinDecodedAt = new Date().toISOString()

  return {
    vehicle,
    raw: root,
  }
}

async function decodeVin(vinInput) {
  const vin = normalizeVin(vinInput)
  if (!VIN_RE.test(vin)) {
    throw httpError('请输入 17 位有效车架号（VIN）', 400, 'INVALID_VIN')
  }

  const appCode = config.aliyunVin && config.aliyunVin.appCode
  if (!appCode) {
    throw httpError(
      '未配置 VIN 解析服务（ALIYUN_VIN_APPCODE），请手工填写品牌与车系',
      503,
      'VIN_DECODE_NOT_CONFIGURED',
    )
  }

  const host = (config.aliyunVin && config.aliyunVin.host) || 'https://sxvin.market.alicloudapi.com'
  const path = (config.aliyunVin && config.aliyunVin.path) || '/vin/query'
  const url = new URL(path, host)
  url.searchParams.set('vin', vin)

  const timeoutMs = Number((config.aliyunVin && config.aliyunVin.timeoutMs) || 12000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response
  let text = ''
  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `APPCODE ${appCode}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    text = await response.text()
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw httpError('VIN 解析超时，请稍后重试或手工填写', 504, 'VIN_DECODE_TIMEOUT')
    }
    throw httpError('VIN 解析服务暂不可用，请手工填写车型', 502, 'VIN_DECODE_NETWORK')
  } finally {
    clearTimeout(timer)
  }

  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch (_) {
    body = null
  }

  if (!response.ok) {
    const msg =
      (body && (body.msg || body.message || body.error_msg || body.reason)) ||
      `VIN 解析失败（HTTP ${response.status}）`
    throw httpError(String(msg).slice(0, 200), 502, 'VIN_DECODE_FAILED')
  }

  const errCode = body && (body.error_code ?? body.errorCode ?? body.code ?? body.status)
  if (
    errCode != null &&
    String(errCode) !== '0' &&
    String(errCode) !== '200' &&
    String(errCode).toUpperCase() !== 'OK' &&
    String(errCode).toUpperCase() !== 'SUCCESS'
  ) {
    const msg =
      (body && (body.reason || body.msg || body.message || body.error_msg)) || 'VIN 未查询到结果'
    throw httpError(String(msg).slice(0, 200), 404, 'VIN_DECODE_EMPTY')
  }

  const mapped = mapAliyunVinResult(body || {})
  if (!mapped.vehicle.brand && !mapped.vehicle.series) {
    throw httpError('未解析到品牌/车系，请手工填写', 404, 'VIN_DECODE_EMPTY')
  }
  if (!mapped.vehicle.vin) mapped.vehicle.vin = vin

  return {
    vin,
    vehicle: mapped.vehicle,
  }
}

module.exports = {
  decodeVin,
  normalizeVin,
  mapAliyunVinResult,
}
