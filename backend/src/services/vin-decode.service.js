/**
 * ALB-UX-02 / ALB-UX-14 · VIN 解析：先查本地缓存，未命中再调阿里云并落库
 * @see https://market.aliyun.com/detail/cmapi00065243
 */
const { config } = require('../config')
const { prisma } = require('../lib/prisma')

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i

/** 第 10 位年份代码允许的字符（不含 I/O/Q/U/Z/0），用于付费解析前的本地拦截 */
const VIN_YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789'

/** 对外统一错误文案：只区分「格式不对」「未解析到车型」「服务不可用」三种 */
const MSG_INVALID_VIN = '请输入 17 位有效车架号（VIN）'
const MSG_DECODE_EMPTY = '未解析到车型，请手工填写品牌与车系'
const MSG_SERVICE_UNAVAILABLE = '车型解析服务暂不可用，请手工填写品牌与车系'
const MSG_DECODE_TIMEOUT = '车型解析超时，请稍后重试或手工填写品牌与车系'

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

function cacheVehicleUsable(vehicleJson) {
  if (!vehicleJson || typeof vehicleJson !== 'object' || Array.isArray(vehicleJson)) return false
  const brand = String(vehicleJson.brand || '').trim()
  const series = String(vehicleJson.series || '').trim()
  return Boolean(brand || series)
}

async function findCachedDecode(vin) {
  if (!prisma.vinDecodeCache) return null
  try {
    return await prisma.vinDecodeCache.findUnique({ where: { vin } })
  } catch (err) {
    console.warn('[vin-decode] cache lookup failed', err && err.message)
    return null
  }
}

async function touchCacheHit(vin) {
  if (!prisma.vinDecodeCache) return
  try {
    await prisma.vinDecodeCache.update({
      where: { vin },
      data: {
        hitCount: { increment: 1 },
        lastHitAt: new Date(),
      },
    })
  } catch (err) {
    console.warn('[vin-decode] cache hit update failed', err && err.message)
  }
}

async function upsertDecodeCache(vin, vehicle, source = 'aliyun') {
  if (!prisma.vinDecodeCache) return
  try {
    await prisma.vinDecodeCache.upsert({
      where: { vin },
      create: {
        vin,
        vehicleJson: vehicle,
        source,
        hitCount: 0,
        lastHitAt: null,
      },
      update: {
        vehicleJson: vehicle,
        source,
      },
    })
  } catch (err) {
    console.warn('[vin-decode] cache upsert failed', err && err.message)
  }
}

function pickFirst(obj, keys) {
  for (const key of keys) {
    const val = obj && obj[key]
    if (val != null && String(val).trim() !== '') return String(val).trim()
  }
  return ''
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** 收集可能承载车型字段的节点（兼容 data/result/list[0]/carlist[0]/嵌套） */
function collectCandidateNodes(raw = {}) {
  const nodes = []
  const seen = new Set()
  const push = (item) => {
    if (!isPlainObject(item) || seen.has(item)) return
    seen.add(item)
    nodes.push(item)
  }

  push(raw)
  const queue = [raw]
  while (queue.length) {
    const cur = queue.shift()
    if (!isPlainObject(cur)) continue
    ;[
      'result',
      'Result',
      'data',
      'Data',
      'body',
      'Body',
      'showapi_res_body',
      'vehicle',
      'Vehicle',
      'car',
      'Car',
      'info',
      'Info',
    ].forEach((key) => {
      const child = cur[key]
      if (isPlainObject(child)) {
        push(child)
        queue.push(child)
      } else if (Array.isArray(child) && child[0] && isPlainObject(child[0])) {
        push(child[0])
        queue.push(child[0])
      }
    })
    ;['list', 'List', 'carlist', 'carList', 'Cars', 'items', 'Items', 'records'].forEach((key) => {
      const arr = cur[key]
      if (Array.isArray(arr) && arr[0] && isPlainObject(arr[0])) {
        push(arr[0])
        queue.push(arr[0])
      }
    })
  }
  return nodes
}

function pickAcross(nodes, keys) {
  for (const node of nodes) {
    const value = pickFirst(node, keys)
    if (value) return value
  }
  return ''
}

/** 从「品牌 车系 2020款 …」类全称拆品牌/车系 */
function splitNameParts(name) {
  const text = String(name || '').trim()
  if (!text) return { brand: '', series: '', modelYear: '' }
  const yearMatch = text.match(/(19|20)\d{2}\s*款?/)
  const modelYear = yearMatch ? yearMatch[0].replace(/款/g, '').trim() : ''
  const head = text
    .replace(/(19|20)\d{2}\s*款?.*/u, '')
    .replace(/\s+/g, ' ')
    .trim()
  const parts = head.split(/[\s/|·]+/).filter(Boolean)
  return {
    brand: parts[0] || '',
    series: parts[1] || parts[0] || '',
    modelYear,
  }
}

function isApiSuccessCode(errCode) {
  if (errCode == null || errCode === '') return true
  const value = String(errCode).trim().toUpperCase()
  return (
    value === '0' ||
    value === '1' ||
    value === '200' ||
    value === '00000' ||
    value === 'OK' ||
    value === 'SUCCESS' ||
    value === 'TRUE'
  )
}

/**
 * 将云市场常见字段映射为相册 vehicleJson 增量
 */
function mapAliyunVinResult(raw = {}) {
  const nodes = collectCandidateNodes(raw)
  let brand = pickAcross(nodes, [
    'brand',
    'Brand',
    'brand_name',
    'brandName',
    'carBrand',
    'car_brand',
    '品牌',
    'manufacturer',
    'Manufacturer',
    '厂家',
    '厂商',
    'company',
  ])
  let series = pickAcross(nodes, [
    'series',
    'Series',
    'series_name',
    'seriesName',
    'carSeries',
    'car_series',
    '车系',
    'typename',
    'typeName',
    '车型名称',
    'groupname',
    'groupName',
    'group_name',
    'vehicleName',
    'cartype',
    'carType',
    '车型',
  ])
  let modelYear = pickAcross(nodes, [
    'modelYear',
    'model_year',
    'year',
    'Year',
    'yeartype',
    'yearType',
    'year_type',
    '年份',
    '年款',
    'produceYear',
    '生产年份',
    'manufacture_year',
    'manufactureYear',
    'market_date',
    'marketDate',
    'listdate',
    'listDate',
  ])
  const chassisCode = pickAcross(nodes, [
    'chassisCode',
    'chassis',
    'chassisNo',
    'chassis1',
    '底盘号',
    'model',
    'Model',
    '整车型号',
    'noticetype',
  ])
  const engineModel = pickAcross(nodes, [
    'engineModel',
    'engine_model',
    'enginemodel',
    'engine',
    'Engine',
    '发动机型号',
    'engineNo',
  ])
  const displacement = pickAcross(nodes, [
    'displacement',
    'displacementml',
    '排量',
    'cc',
  ])
  const gearbox = pickAcross(nodes, [
    'gearbox',
    'transmission',
    'geartype',
    'gearType',
    '变速箱',
    '变速器',
  ])
  const vin = normalizeVin(pickAcross(nodes, ['vin', 'VIN', 'Vin', 'idx_vin', 'idxVin']))
  const fullName = pickAcross(nodes, ['name', 'Name', '车辆名称', 'carName', 'title'])

  if ((!brand || !series) && fullName) {
    const parts = splitNameParts(fullName)
    if (!brand && parts.brand) brand = parts.brand
    if (!series && parts.series) series = parts.series
    if (!modelYear && parts.modelYear) modelYear = parts.modelYear
  }

  // 年款清洗：2010/01 → 2010；2010年 → 2010
  if (modelYear) {
    const yearOnly = String(modelYear).match(/(19|20)\d{2}/)
    if (yearOnly) modelYear = yearOnly[0]
  }

  const vehicle = {}
  if (brand) vehicle.brand = brand
  if (series) vehicle.series = series
  if (modelYear) vehicle.modelYear = modelYear
  if (chassisCode) vehicle.chassisCode = chassisCode
  if (engineModel) vehicle.engineModel = engineModel
  if (displacement) vehicle.displacement = displacement
  if (gearbox) vehicle.gearbox = gearbox
  if (vin) vehicle.vin = vin
  if (fullName) vehicle.modelName = fullName
  vehicle.vinDecodedAt = new Date().toISOString()

  return {
    vehicle,
    raw: nodes[0] || raw,
    candidateCount: nodes.length,
  }
}

function summarizeBodyForLog(body) {
  if (!body || typeof body !== 'object') return { type: typeof body }
  const keys = Object.keys(body).slice(0, 20)
  const nested = body.data || body.result || body.Data || body.Result
  const nestedKeys = isPlainObject(nested) ? Object.keys(nested).slice(0, 30) : []
  const list0 =
    (Array.isArray(nested && nested.list) && nested.list[0]) ||
    (Array.isArray(body.list) && body.list[0]) ||
    null
  return {
    keys,
    nestedKeys,
    list0Keys: isPlainObject(list0) ? Object.keys(list0).slice(0, 30) : [],
    code: body.error_code ?? body.errorCode ?? body.code ?? body.status ?? null,
    msg: body.reason || body.msg || body.message || body.error_msg || '',
  }
}

async function decodeVin(vinInput) {
  const vin = normalizeVin(vinInput)
  if (!VIN_RE.test(vin) || !VIN_YEAR_CODES.includes(vin[9])) {
    throw httpError(MSG_INVALID_VIN, 400, 'INVALID_VIN')
  }

  const cached = await findCachedDecode(vin)
  if (cached && cacheVehicleUsable(cached.vehicleJson)) {
    const vehicle = { ...cached.vehicleJson }
    if (!vehicle.vin) vehicle.vin = vin
    await touchCacheHit(vin)
    return {
      vin,
      vehicle,
      source: 'cache',
    }
  }

  const appCode = config.aliyunVin && config.aliyunVin.appCode
  if (!appCode) {
    throw httpError(MSG_SERVICE_UNAVAILABLE, 503, 'VIN_DECODE_NOT_CONFIGURED')
  }

  const host = (config.aliyunVin && config.aliyunVin.host) || 'https://sxvinv2.market.alicloudapi.com'
  const path = (config.aliyunVin && config.aliyunVin.path) || '/vin/query/v2'
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
      throw httpError(MSG_DECODE_TIMEOUT, 504, 'VIN_DECODE_TIMEOUT')
    }
    throw httpError(MSG_SERVICE_UNAVAILABLE, 502, 'VIN_DECODE_NETWORK')
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
    console.warn('[vin-decode] http failed', {
      status: response.status,
      msg: (body && (body.msg || body.message || body.error_msg || body.reason)) || '',
      summary: summarizeBodyForLog(body),
    })
    // 4xx（除鉴权/额度类 401/403）视为该 VIN 查不到，其余视为服务不可用
    const notFoundLike = response.status < 500 && response.status !== 401 && response.status !== 403
    if (notFoundLike) throw httpError(MSG_DECODE_EMPTY, 404, 'VIN_DECODE_EMPTY')
    throw httpError(MSG_SERVICE_UNAVAILABLE, 502, 'VIN_DECODE_FAILED')
  }

  const errCode = body && (body.error_code ?? body.errorCode ?? body.code ?? body.status)
  if (!isApiSuccessCode(errCode)) {
    console.warn('[vin-decode] business empty', {
      code: errCode,
      msg: (body && (body.reason || body.msg || body.message || body.error_msg)) || '',
      summary: summarizeBodyForLog(body),
    })
    throw httpError(MSG_DECODE_EMPTY, 404, 'VIN_DECODE_EMPTY')
  }

  const mapped = mapAliyunVinResult(body || {})
  if (!mapped.vehicle.brand && !mapped.vehicle.series) {
    console.warn('[vin-decode] mapped empty brand/series', {
      vin,
      summary: summarizeBodyForLog(body),
      candidateCount: mapped.candidateCount,
    })
    throw httpError(MSG_DECODE_EMPTY, 404, 'VIN_DECODE_EMPTY')
  }
  if (!mapped.vehicle.vin) mapped.vehicle.vin = vin

  await upsertDecodeCache(vin, mapped.vehicle, 'aliyun')

  return {
    vin,
    vehicle: mapped.vehicle,
    source: 'aliyun',
  }
}

module.exports = {
  decodeVin,
  normalizeVin,
  mapAliyunVinResult,
  collectCandidateNodes,
  splitNameParts,
  isApiSuccessCode,
}
