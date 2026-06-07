/**
 * 服务方案 — mock + API
 * prod/dev: GET /api/user/services、/merchant/service-plans*
 */
const { ENV } = require('./config')
const { get, post, put } = require('./request')
const { SEED_SERVICES } = require('../mock/services')
const {
  SERVICE_STATUS,
  SERVICE_STATUS_LABEL,
  SERVICE_ITEM_LIST,
  getCategoryName,
  getServiceItem,
} = require('../constants/service')
const { PRICE_MODE, PRICE_MODE_LABEL } = require('../constants/price-mode')
const {
  buildAppointmentSection,
  normalizeAppointmentJson,
} = require('../constants/service-appointment')
const { fetchStoreDetail } = require('./store')
const { fetchCaseList } = require('./case')
const { applyDetailTemplate } = require('../utils/service-detail-template')
const { resolveRelatedCases } = require('../utils/service-case-link')
const { buildStoreCardTags } = require('../utils/store-tags')
const {
  pauseServiceAppointment,
  resumeServiceAppointment,
} = require('./merchant-service-plan-actions')

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

function statusVariantFor(status, acceptAppointment = true) {
  if (status === SERVICE_STATUS.PUBLISHED) {
    return acceptAppointment !== false ? 'success' : 'warning'
  }
  if (status === SERVICE_STATUS.SUSPENDED) return 'danger'
  if (status === SERVICE_STATUS.PENDING_REVIEW) return 'default'
  if (status === SERVICE_STATUS.REJECTED || status === SERVICE_STATUS.NEED_MODIFY) {
    return 'danger'
  }
  return 'warning'
}

function merchantListStatusMeta(record) {
  const status = record.status || SERVICE_STATUS.DRAFT
  const acceptAppointment = record.acceptAppointment !== false
  if (status === SERVICE_STATUS.PUBLISHED && !acceptAppointment) {
    return { statusLabel: '暂停预约', statusVariant: 'warning' }
  }
  return {
    statusLabel: SERVICE_STATUS_LABEL[status] || status,
    statusVariant: statusVariantFor(status, acceptAppointment),
  }
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
  const appointmentJson = normalizeAppointmentJson(record.appointmentJson)

  let relatedCases = Array.isArray(record.relatedCases) ? record.relatedCases : null
  let caseTotal = record.caseTotal
  let caseLinkTier = record.caseLinkTier
  if (!relatedCases) {
    const resolved = resolveRelatedCases(record, (await fetchCaseList()).list, { limit: 3 })
    relatedCases = resolved.list
    caseTotal = resolved.total
    caseLinkTier = resolved.tier
  }

  let availableMerchants = []
  if (record.storeId) {
    try {
      const store = await fetchStoreDetail(record.storeId)
      availableMerchants = [{ ...store, cardTags: buildStoreCardTags(store) }]
    } catch (e) {
      availableMerchants = []
    }
  }

  const status = record.status || SERVICE_STATUS.DRAFT
  const viewModel = {
    ...record,
    detail: record.detail || record.summary || '',
    ...templateFields,
    applicableVehicles: appointmentJson.applicableVehicles,
    headTags: buildHeadTags(record),
    keyInfoRows: buildKeyInfoRows(record, templateFields),
    relatedCases,
    caseTotal,
    caseLinkTier,
    availableMerchants,
    appointmentSection: buildAppointmentSection(record),
    bookable:
      status === SERVICE_STATUS.PUBLISHED && record.acceptAppointment !== false,
  }

  if (audience === 'merchant') {
    const acceptAppointment = record.acceptAppointment !== false
    const listMeta = merchantListStatusMeta(record)
    viewModel.statusLabel = listMeta.statusLabel
    viewModel.statusVariant = listMeta.statusVariant
    viewModel.editable =
      status !== SERVICE_STATUS.SUSPENDED &&
      (status === SERVICE_STATUS.DRAFT ||
        status === SERVICE_STATUS.APPROVED ||
        status === SERVICE_STATUS.PUBLISHED)
    viewModel.canPublish =
      status === SERVICE_STATUS.DRAFT || status === SERVICE_STATUS.APPROVED
    viewModel.canUnpublish = status === SERVICE_STATUS.PUBLISHED
    viewModel.canPauseAppointment =
      status === SERVICE_STATUS.PUBLISHED && acceptAppointment
    viewModel.canResumeAppointment =
      status === SERVICE_STATUS.PUBLISHED && !acceptAppointment
    viewModel.appointmentPaused = status === SERVICE_STATUS.PUBLISHED && !acceptAppointment
  }

  return viewModel
}

/**
 * 用户端 — 已上架服务列表
 * @param {{ categoryId?: string, storeId?: string }} [query]
 */
async function fetchServiceList(query = {}) {
  if (ENV.mode !== 'mock') {
    return get('/user/services', query)
  }
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
  const audience = opts.audience || 'user'

  if (ENV.mode !== 'mock') {
    const record =
      audience === 'merchant'
        ? await get(`/merchant/service-plans/${id}`)
        : await get(`/user/services/${id}`)
    return buildServiceDetailViewModel(record, opts)
  }

  await delay()
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

function normalizeServiceItem(item) {
  if (!item) return null
  return {
    ...item,
    defaultPriceMode: item.defaultPriceMode,
    complexity: item.complexity || item.complexityLevel || '',
  }
}

/**
 * 商家端 — 平台标准服务项目（创建方案时选择）
 */
async function fetchMerchantServiceItems() {
  if (ENV.mode !== 'mock') {
    const data = await get('/merchant/service-items')
    const list = (data.list || [])
      .filter((item) => item.selectable !== false && item.id !== 'item_custom')
      .map(normalizeServiceItem)
      .filter(Boolean)
    return { list, total: list.length }
  }

  await delay()
  const list = SERVICE_ITEM_LIST.map(normalizeServiceItem)
  return { list, total: list.length }
}

/**
 * 商家端 — 本店服务方案列表
 * @param {string} [status]
 */
async function fetchMerchantServiceList(status) {
  if (ENV.mode !== 'mock') {
    const query = status ? { status } : {}
    const data = await get('/merchant/service-plans', query)
    return {
      list: (data.list || []).map((s) => ({
        ...s,
        ...merchantListStatusMeta(s),
      })),
      total: data.total || 0,
    }
  }

  await delay()
  let list = loadMerchantServices()
  if (status) {
    list = list.filter((s) => s.status === status)
  }
  return {
    list: list
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .map((s) => ({
        ...s,
        ...merchantListStatusMeta(s),
      })),
    total: list.length,
  }
}

function buildMockServiceRecord(payload, existing, submitReview) {
  const item = getServiceItem(payload.serviceItemId)
  const now = Date.now()
  const id = payload.id || existing?.id || `svc_${now}`
  const priceMode = payload.priceMode || item?.defaultPriceMode || PRICE_MODE.RANGE

  let status = SERVICE_STATUS.DRAFT
  if (submitReview) {
    status = SERVICE_STATUS.PUBLISHED
  }

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
    appointmentJson: payload.appointmentJson || existing?.appointmentJson || {},
    acceptAppointment: payload.acceptAppointment !== false,
    storeId: payload.storeId || existing?.storeId || 'store_demo_1',
    storeName: payload.storeName || existing?.storeName || '辙见示范店（杭州滨江）',
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
  if (ENV.mode !== 'mock') {
    let record
    if (payload.id) {
      record = await put(`/merchant/service-plans/${payload.id}`, payload, {
        showLoading: true,
        loadingText: submitReview ? '提交中' : '保存中',
      })
    } else {
      record = await post('/merchant/service-plans', payload, {
        showLoading: true,
        loadingText: submitReview ? '提交中' : '保存中',
      })
    }
    if (submitReview) {
      record = await post(
        `/merchant/service-plans/${record.id}/publish`,
        {},
        { showLoading: true, loadingText: '上架中' }
      )
    }
    return record
  }

  await delay(submitReview ? 500 : 280)
  const list = loadMerchantServices()
  const existing = payload.id ? list.find((s) => s.id === payload.id) : null
  const record = buildMockServiceRecord(payload, existing, submitReview)
  const next = list.filter((s) => s.id !== record.id)
  next.unshift(record)
  saveMerchantServices(next)
  return record
}

async function publishServicePlan(planId) {
  if (ENV.mode !== 'mock') {
    return post(`/merchant/service-plans/${planId}/publish`, {}, {
      showLoading: true,
      loadingText: '上架中',
    })
  }
  await delay()
  const list = loadMerchantServices()
  const idx = list.findIndex((s) => s.id === planId)
  if (idx < 0) throw new Error('服务方案不存在')
  list[idx] = {
    ...list[idx],
    status: SERVICE_STATUS.PUBLISHED,
    publishedAt: new Date().toISOString().slice(0, 10),
    updatedAt: Date.now(),
  }
  saveMerchantServices(list)
  return list[idx]
}

async function unpublishServicePlan(planId) {
  if (ENV.mode !== 'mock') {
    return post(`/merchant/service-plans/${planId}/unpublish`, {}, {
      showLoading: true,
      loadingText: '下架中',
    })
  }
  await delay()
  const list = loadMerchantServices()
  const idx = list.findIndex((s) => s.id === planId)
  if (idx < 0) throw new Error('服务方案不存在')
  list[idx] = {
    ...list[idx],
    status: SERVICE_STATUS.APPROVED,
    updatedAt: Date.now(),
  }
  saveMerchantServices(list)
  return list[idx]
}

module.exports = {
  fetchServiceList,
  fetchServiceDetail,
  fetchMerchantServiceItems,
  fetchMerchantServiceList,
  saveServicePlan,
  publishServicePlan,
  unpublishServicePlan,
  pauseServiceAppointment,
  resumeServiceAppointment,
  findRawService,
  buildServiceDetailViewModel,
}
