const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const { getServiceItem } = require('../constants/service-catalog')
const {
  PLAN_AUDIT_STATUS,
  PLAN_SALE_STATUS,
  CLIENT_STATUS,
} = require('../constants/service-plan')
const { formatPlanRecord } = require('./service-plan-format')

const EDITABLE_SALE = new Set([PLAN_SALE_STATUS.OFFLINE, PLAN_SALE_STATUS.ONLINE])

function buildReviewComment(reasonType, comment) {
  return [reasonType, comment].filter(Boolean).join('：')
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((s) => String(s).trim()).filter(Boolean)
}

function buildPlanData(payload, item, existing) {
  const priceMode = payload.priceMode || item?.defaultPriceMode || 'range'
  return {
    serviceItemId: payload.serviceItemId || existing?.serviceItemId,
    categoryId: item?.categoryId || payload.categoryId || existing?.categoryId || '',
    name: String(payload.name || existing?.name || '').trim(),
    summary: String(payload.summary || existing?.summary || '').trim(),
    detail: String(payload.detail || payload.summary || existing?.detail || '').trim(),
    priceMode,
    amount: payload.amount != null ? Number(payload.amount) : null,
    minAmount: payload.minAmount != null ? Number(payload.minAmount) : null,
    maxAmount: payload.maxAmount != null ? Number(payload.maxAmount) : null,
    priceFactors: normalizeStringArray(payload.priceFactors ?? existing?.priceFactors),
    includedItems: normalizeStringArray(payload.includedItems ?? existing?.includedItems),
    excludedItems: normalizeStringArray(payload.excludedItems ?? existing?.excludedItems),
    appointmentJson:
      payload.appointmentJson && typeof payload.appointmentJson === 'object'
        ? payload.appointmentJson
        : existing?.appointmentJson || {},
    acceptAppointment:
      payload.acceptAppointment != null
        ? Boolean(payload.acceptAppointment)
        : existing?.acceptAppointment !== false,
    coverUrl: payload.coverUrl || existing?.coverUrl || '',
  }
}

function validatePlanPayload(data) {
  if (!data.serviceItemId) {
    const err = new Error('请选择或填写服务类型')
    err.status = 400
    throw err
  }
  const item = getServiceItem(data.serviceItemId)
  if (!item) {
    const err = new Error('无效的服务项目')
    err.status = 400
    throw err
  }
  if (!data.name) {
    const err = new Error('请填写服务名称')
    err.status = 400
    throw err
  }
  return item
}

async function loadStoreForMerchant(storeId, merchantId) {
  const store = await prisma.store.findFirst({
    where: { id: storeId, merchantId },
  })
  if (!store) {
    const err = new Error('门店不存在')
    err.status = 404
    throw err
  }
  return store
}

async function loadOwnedPlan(planId, merchantId, storeId) {
  const plan = await prisma.merchantServicePlan.findFirst({
    where: { id: planId, merchantId, storeId },
  })
  if (!plan) {
    const err = new Error('服务方案不存在')
    err.status = 404
    throw err
  }
  return plan
}

async function listMerchantServicePlans(merchantId, storeId, query = {}) {
  const store = await loadStoreForMerchant(storeId, merchantId)
  const where = { merchantId, storeId }

  const status = String(query.status || query.auditStatus || '').trim()
  if (status && status !== 'all') {
    if (status === CLIENT_STATUS.DRAFT) {
      where.auditStatus = PLAN_AUDIT_STATUS.DRAFT
    } else if (status === CLIENT_STATUS.PENDING_REVIEW) {
      where.auditStatus = PLAN_AUDIT_STATUS.PENDING_AUDIT
    } else if (status === CLIENT_STATUS.REJECTED) {
      where.auditStatus = PLAN_AUDIT_STATUS.REJECTED
    } else if (status === CLIENT_STATUS.APPROVED) {
      where.auditStatus = PLAN_AUDIT_STATUS.APPROVED
      where.saleStatus = PLAN_SALE_STATUS.OFFLINE
    } else if (status === CLIENT_STATUS.PUBLISHED) {
      where.auditStatus = PLAN_AUDIT_STATUS.APPROVED
      where.saleStatus = PLAN_SALE_STATUS.ONLINE
    } else if (Object.values(PLAN_AUDIT_STATUS).includes(status.toUpperCase())) {
      where.auditStatus = status.toUpperCase()
    }
  }

  const rows = await prisma.merchantServicePlan.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  })

  const list = rows.map((row) => formatPlanRecord(row, store))
  return { list, total: list.length }
}

async function getMerchantServicePlan(planId, merchantId, storeId) {
  const store = await loadStoreForMerchant(storeId, merchantId)
  const plan = await loadOwnedPlan(planId, merchantId, storeId)
  return formatPlanRecord(plan, store)
}

async function createMerchantServicePlan(merchantId, storeId, payload = {}) {
  const store = await loadStoreForMerchant(storeId, merchantId)
  const item = validatePlanPayload(buildPlanData(payload, getServiceItem(payload.serviceItemId)))
  const data = buildPlanData(payload, item)

  const row = await prisma.merchantServicePlan.create({
    data: {
      id: newId('msp'),
      merchantId,
      storeId,
      ...data,
      auditStatus: PLAN_AUDIT_STATUS.DRAFT,
      saleStatus: PLAN_SALE_STATUS.OFFLINE,
      acceptAppointment: data.acceptAppointment !== false,
    },
  })
  return formatPlanRecord(row, store)
}

async function updateMerchantServicePlan(planId, merchantId, storeId, payload = {}) {
  const store = await loadStoreForMerchant(storeId, merchantId)
  const existing = await loadOwnedPlan(planId, merchantId, storeId)

  if (existing.saleStatus === PLAN_SALE_STATUS.SUSPENDED) {
    const err = new Error('内容已下架，请联系客服处理后再编辑')
    err.status = 409
    throw err
  }
  if (!EDITABLE_SALE.has(existing.saleStatus)) {
    const err = new Error('当前状态不可编辑')
    err.status = 409
    throw err
  }

  const item = getServiceItem(payload.serviceItemId || existing.serviceItemId)
  const merged = buildPlanData(payload, item, existing)
  validatePlanPayload(merged)

  const row = await prisma.merchantServicePlan.update({
    where: { id: planId },
    data: merged,
  })
  return formatPlanRecord(row, store)
}

/** @deprecated 兼容旧客户端；等同 publish */
async function submitMerchantServicePlan(planId, merchantId, storeId) {
  return publishMerchantServicePlan(planId, merchantId, storeId)
}

async function publishMerchantServicePlan(planId, merchantId, storeId) {
  const store = await loadStoreForMerchant(storeId, merchantId)
  const existing = await loadOwnedPlan(planId, merchantId, storeId)

  if (existing.saleStatus === PLAN_SALE_STATUS.SUSPENDED) {
    const err = new Error('内容已下架，请联系客服')
    err.status = 409
    throw err
  }
  if (existing.saleStatus === PLAN_SALE_STATUS.ONLINE) {
    const err = new Error('方案已上架')
    err.status = 409
    throw err
  }

  const item = getServiceItem(existing.serviceItemId)
  const data = buildPlanData(existing, item, existing)
  validatePlanPayload(data)

  const row = await prisma.merchantServicePlan.update({
    where: { id: planId },
    data: {
      auditStatus: PLAN_AUDIT_STATUS.APPROVED,
      saleStatus: PLAN_SALE_STATUS.ONLINE,
      rejectReason: '',
      publishedAt: existing.publishedAt || new Date(),
    },
  })
  return formatPlanRecord(row, store)
}

async function unpublishMerchantServicePlan(planId, merchantId, storeId) {
  const store = await loadStoreForMerchant(storeId, merchantId)
  await loadOwnedPlan(planId, merchantId, storeId)

  const row = await prisma.merchantServicePlan.update({
    where: { id: planId },
    data: { saleStatus: PLAN_SALE_STATUS.OFFLINE },
  })
  return formatPlanRecord(row, store)
}

module.exports = {
  listMerchantServicePlans,
  getMerchantServicePlan,
  createMerchantServicePlan,
  updateMerchantServicePlan,
  submitMerchantServicePlan,
  publishMerchantServicePlan,
  unpublishMerchantServicePlan,
  buildReviewComment,
}
