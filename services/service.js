/**
 * 服务方案 — V0.1 S7 / S7b mock
 * MOCK: mock/services.js + storage merchant_services_v1
 */
const { SEED_SERVICES } = require('../mock/services')
const {
  SERVICE_STATUS,
  SERVICE_STATUS_LABEL,
  getCategoryName,
  getServiceItem,
} = require('../constants/service')
const { PRICE_MODE, PRICE_MODE_LABEL } = require('../constants/price-mode')
const { getProfile } = require('./merchant')
const { fetchStoreDetail } = require('./store')
const { fetchCaseList } = require('./case')
const { applyDetailTemplate } = require('../utils/service-detail-template')
const { resolveRelatedCases } = require('../utils/service-case-link')
const { buildStoreCardTags } = require('../utils/store-tags')

const STORAGE_KEY = 'merchant_services_v1'

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadMerchantServices() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || []
  } catch (e) {
    return []
  }
}

function saveMerchantServices(list) {
  wx.setStorageSync(STORAGE_KEY, list)
}

function mergePublishedServices() {
  const local = loadMerchantServices().filter(
    (s) => s.status === SERVICE_STATUS.PUBLISHED
  )
  const map = new Map()
  SEED_SERVICES.forEach((s) => map.set(s.id, s))
  local.forEach((s) => map.set(s.id, s))
  return Array.from(map.values()).sort((a, b) => {
    const ta = a.publishedAt || ''
    const tb = b.publishedAt || ''
    return tb.localeCompare(ta)
  })
}

function findRawService(id, audience = 'user') {
  if (audience === 'merchant') {
    const local = loadMerchantServices().find((s) => s.id === id)
    if (local) return local
    return SEED_SERVICES.find((s) => s.id === id) || null
  }
  return mergePublishedServices().find((s) => s.id === id) || null
}

function buildHeadTags(record) {
  const tags = []
  if (record.categoryName) {
    tags.push({ variant: 'default', text: record.categoryName })
  }
  const modeLabel = PRICE_MODE_LABEL[record.priceMode]
  if (modeLabel) {
    const variant =
      record.priceMode === PRICE_MODE.FIXED
        ? 'success'
        : record.priceMode === PRICE_MODE.ACCIDENT
          ? 'accident'
          : 'onsite'
    tags.push({ variant, text: modeLabel })
  }
  return tags.slice(0, 3)
}

function buildKeyInfoRows(record, templateFields) {
  return [
    { label: '服务分类', value: record.categoryName || '—' },
    { label: '提供门店', value: record.storeName || '—' },
    { label: '费用确认', value: '到店检测后由门店报价' },
    { label: '服务类型', value: templateFields.complexityLabel || '常规维修' },
  ]
}

/**
 * 构建详情 ViewModel（用户/商家预览共用）
 * @param {object} record
 * @param {{ audience?: 'user'|'merchant' }} [opts]
 */
async function buildServiceDetailViewModel(record, opts = {}) {
  const audience = opts.audience || 'user'
  const templateFields = applyDetailTemplate(record)
  const { list: relatedCases, total: caseTotal, tier: caseLinkTier } =
    resolveRelatedCases(record, (await fetchCaseList()).list, { limit: 3 })

  let availableMerchants = []
  if (record.storeId) {
    try {
      const store = await fetchStoreDetail(record.storeId)
      availableMerchants = [{ ...store, cardTags: buildStoreCardTags(store) }]
    } catch (e) {
      availableMerchants = []
    }
  }

  const viewModel = {
    ...record,
    detail: record.detail || record.summary || '',
    ...templateFields,
    headTags: buildHeadTags(record),
    keyInfoRows: buildKeyInfoRows(record, templateFields),
    relatedCases,
    caseTotal,
    caseLinkTier,
    availableMerchants,
    bookable: record.status === SERVICE_STATUS.PUBLISHED,
  }

  if (audience === 'merchant') {
    viewModel.statusLabel =
      SERVICE_STATUS_LABEL[record.status] || record.status
    viewModel.statusVariant =
      record.status === SERVICE_STATUS.PUBLISHED ? 'success' : 'warning'
    viewModel.editable =
      record.status === SERVICE_STATUS.DRAFT ||
      record.status === SERVICE_STATUS.PUBLISHED
  }

  return viewModel
}

/**
 * 用户端 — 已上架服务列表
 * @param {{ categoryId?: string, storeId?: string }} [query]
 */
async function fetchServiceList(query = {}) {
  await delay()
  let list = mergePublishedServices()
  if (query.categoryId) {
    list = list.filter((s) => s.categoryId === query.categoryId)
  }
  if (query.storeId) {
    list = list.filter((s) => s.storeId === query.storeId)
  }
  return { list, total: list.length }
}

/**
 * 服务详情 — 用户端 / 商家预览
 * @param {string} id
 * @param {{ audience?: 'user'|'merchant' }} [opts]
 */
async function fetchServiceDetail(id, opts = {}) {
  await delay()
  const audience = opts.audience || 'user'
  const record = findRawService(id, audience)
  if (!record) {
    const err = new Error('该服务已下架，请查看其他服务')
    err.code = 404
    throw err
  }
  if (audience === 'user' && record.status !== SERVICE_STATUS.PUBLISHED) {
    const err = new Error('该服务已下架，请查看其他服务')
    err.code = 404
    throw err
  }
  return buildServiceDetailViewModel(record, { audience })
}

/**
 * 商家端 — 本店服务方案列表
 * @param {string} [status]
 */
async function fetchMerchantServiceList(status) {
  await delay()
  let list = loadMerchantServices()
  if (status) {
    list = list.filter((s) => s.status === status)
  }
  return {
    list: list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    total: list.length,
  }
}

function buildServiceRecord(payload, existing, submitReview) {
  const profile = getProfile()
  const item = getServiceItem(payload.serviceItemId)
  const now = Date.now()
  const id = payload.id || existing?.id || `svc_${now}`
  const priceMode = payload.priceMode || item?.defaultPriceMode || PRICE_MODE.RANGE

  let status = submitReview ? SERVICE_STATUS.PENDING_REVIEW : SERVICE_STATUS.DRAFT
  if (submitReview) {
    status = SERVICE_STATUS.PUBLISHED
  }

  const onlinePaymentEnabled =
    priceMode === PRICE_MODE.FIXED && item?.allowOnlinePayment !== false

  return {
    ...(existing || {}),
    id,
    serviceItemId: payload.serviceItemId,
    categoryId: item?.categoryId || payload.categoryId,
    categoryName: getCategoryName(item?.categoryId || payload.categoryId),
    name: payload.name,
    summary: payload.summary,
    detail: payload.detail || payload.summary,
    priceMode,
    amount: payload.amount != null ? Number(payload.amount) : null,
    minAmount: payload.minAmount != null ? Number(payload.minAmount) : null,
    maxAmount: payload.maxAmount != null ? Number(payload.maxAmount) : null,
    priceFactors: payload.priceFactors || existing?.priceFactors || [],
    includedItems: payload.includedItems || existing?.includedItems || [],
    excludedItems: payload.excludedItems || existing?.excludedItems || [],
    storeId: profile?.storeId || 'store_demo_1',
    storeName: profile?.storeName || payload.storeName || '辙见示范店（杭州滨江）',
    onlinePaymentEnabled,
    status,
    publishedAt:
      status === SERVICE_STATUS.PUBLISHED
        ? new Date().toISOString().slice(0, 10)
        : existing?.publishedAt || '',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
}

/**
 * 创建或更新服务方案
 * @param {object} payload
 * @param {boolean} [submitReview]
 */
async function saveServicePlan(payload, submitReview = false) {
  await delay(submitReview ? 500 : 280)
  const list = loadMerchantServices()
  const existing = payload.id ? list.find((s) => s.id === payload.id) : null
  const record = buildServiceRecord(payload, existing, submitReview)
  const next = list.filter((s) => s.id !== record.id)
  next.unshift(record)
  saveMerchantServices(next)
  return record
}

module.exports = {
  fetchServiceList,
  fetchServiceDetail,
  fetchMerchantServiceList,
  saveServicePlan,
  findRawService,
  buildServiceDetailViewModel,
}
